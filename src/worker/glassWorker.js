// Web Worker: pipeline completo de segmentación en "vidriera realista".
// 1) Cuantiza la imagen a un número limitado de colores de vidrio.
// 2) Agrupa píxeles del mismo color en regiones (componentes conexas), lo
//    que hace que las piezas sigan literalmente los contornos reales de
//    la imagen (cara, ropa...).
// 3) Funde las regiones pequeñas (ruido, pero también detalles finos como
//    ojos, cejas o boca) con su vecina más próxima: en una vidriera real
//    esos detalles no son piezas de vidrio separadas, van pintados sobre
//    una única pieza.
// 4) Corta las regiones grandes y planas en varias piezas más pequeñas.
// 5) Calcula un mapa de bordes (Sobel) sobre la imagen original, que el
//    render usa para "pintar" ese detalle fino encima del vidrio.
// Todo esto es costoso en imágenes grandes, así que corre aquí para no
// bloquear la interfaz.

import { quantizeColors } from '../modules/colorQuantize.js';
import { connectedComponents, mergeSmallRegions } from '../modules/regionSegmentation.js';
import { subdivideRegions } from '../modules/pieceSubdivision.js';
import { computeSobelEdges } from '../modules/sobel.js';

self.onmessage = (event) => {
  const msg = event.data;
  if (msg.type !== 'process') return;

  const { requestId, buffer, width, height, colorCount, pieceSize } = msg;
  const data = new Uint8ClampedArray(buffer);

  try {
    postStatus(requestId, 'Analizando los colores...');
    const { labels: colorLabels, glassColors } = quantizeColors(data, width, height, colorCount);

    postStatus(requestId, 'Detectando las formas...');
    const components = connectedComponents(colorLabels, width, height);

    postStatus(requestId, 'Uniendo detalles finos con su pieza...');
    // El umbral de fusión es una fracción del área total de la imagen (no
    // un nº de píxeles fijo), para que escale igual con cualquier
    // resolución: así ojos, cejas, boca o nariz se funden con la piel
    // circundante en vez de quedar como piezas de vidrio propias.
    const totalArea = width * height;
    const sizeFactor = (pieceSize / 90) ** 2;
    const minArea = Math.max(24, Math.round(totalArea * 0.006 * sizeFactor));
    const merged = mergeSmallRegions(
      components.labels,
      components.count,
      components.colorIndex,
      components.area,
      width,
      height,
      minArea
    );

    postStatus(requestId, 'Cortando el vidrio en piezas...');
    const targetPieceArea = Math.max(minArea * 2, pieceSize * pieceSize);
    const pieces = subdivideRegions(
      merged.labels,
      merged.count,
      merged.colorIndex,
      merged.area,
      width,
      height,
      targetPieceArea
    );

    const pieceColors = new Uint8ClampedArray(pieces.pieceCount * 3);
    for (let i = 0; i < pieces.pieceCount; i++) {
      const ci = pieces.pieceColorIndex[i];
      pieceColors[i * 3] = glassColors[ci * 3];
      pieceColors[i * 3 + 1] = glassColors[ci * 3 + 1];
      pieceColors[i * 3 + 2] = glassColors[ci * 3 + 2];
    }

    postStatus(requestId, 'Pintando el detalle fino...');
    const edgeMagnitude = computeSobelEdges(data, width, height);

    self.postMessage(
      {
        type: 'result',
        requestId,
        labels: pieces.labels.buffer,
        pieceColors: pieceColors.buffer,
        pieceCentroidX: pieces.pieceCentroidX.buffer,
        pieceCentroidY: pieces.pieceCentroidY.buffer,
        pieceArea: pieces.pieceArea.buffer,
        pieceCount: pieces.pieceCount,
        edgeMagnitude: edgeMagnitude.buffer,
        width,
        height,
      },
      [
        pieces.labels.buffer,
        pieceColors.buffer,
        pieces.pieceCentroidX.buffer,
        pieces.pieceCentroidY.buffer,
        pieces.pieceArea.buffer,
        edgeMagnitude.buffer,
      ]
    );
  } catch (err) {
    self.postMessage({ type: 'error', requestId, message: err.message || String(err) });
  }
};

function postStatus(requestId, message) {
  self.postMessage({ type: 'status', requestId, message });
}

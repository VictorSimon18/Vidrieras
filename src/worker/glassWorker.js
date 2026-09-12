// Web Worker: pipeline completo de segmentación en "vidriera realista".
// 1) Cuantiza la imagen a un número limitado de colores de vidrio.
// 2) Agrupa píxeles del mismo color en regiones (componentes conexas), lo
//    que hace que las piezas seteen literalmente los contornos reales de
//    la imagen (cara, ojos, boca, ropa...).
// 3) Funde las regiones diminutas (ruido) con su vecina más próxima.
// 4) Corta las regiones grandes y planas en varias piezas más pequeñas.
// Todo esto es costoso en imágenes grandes, así que corre aquí para no
// bloquear la interfaz.

import { quantizeColors } from '../modules/colorQuantize.js';
import { connectedComponents, mergeSmallRegions } from '../modules/regionSegmentation.js';
import { subdivideRegions } from '../modules/pieceSubdivision.js';

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

    postStatus(requestId, 'Uniendo fragmentos diminutos...');
    const minArea = Math.max(6, Math.round((pieceSize * 0.35) ** 2));
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
        width,
        height,
      },
      [
        pieces.labels.buffer,
        pieceColors.buffer,
        pieces.pieceCentroidX.buffer,
        pieces.pieceCentroidY.buffer,
        pieces.pieceArea.buffer,
      ]
    );
  } catch (err) {
    self.postMessage({ type: 'error', requestId, message: err.message || String(err) });
  }
};

function postStatus(requestId, message) {
  self.postMessage({ type: 'status', requestId, message });
}

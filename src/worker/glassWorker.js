// Web Worker: pipeline completo del mosaico de vidriera.
// 1) Genera puntos semilla uniformemente distribuidos.
// 2) Construye un diagrama de Voronoi y calcula el color medio de la foto
//    dentro de cada celda (con delaunay.find(x, y, hint), muy rápido al
//    recorrer la imagen en orden de barrido).
// 3) Convierte cada color medio en un "color de vidrio" más vívido.
// 4) Calcula un mapa de bordes (Sobel) sobre la imagen original, que el
//    render usa para "pintar" detalle fino (rasgos de la cara, pliegues
//    de la ropa...) encima del vidrio sin fragmentarlo en más piezas.
// El recorte de cada celda a un polígono de pocos lados (como el vidrio
// real) se hace en el hilo principal, ya que es barato y así cambiarlo no
// requiere volver a calcular los colores.

import { Delaunay } from 'd3-delaunay';
import { generateSeedPoints } from '../modules/pointGenerator.js';
import { glassifyColor } from '../modules/glassColor.js';
import { computeSobelEdges } from '../modules/sobel.js';

self.onmessage = (event) => {
  const msg = event.data;
  if (msg.type !== 'process') return;

  const { requestId, buffer, width, height, pieceSize } = msg;
  const data = new Uint8ClampedArray(buffer);

  try {
    postStatus(requestId, 'Colocando las piezas de vidrio...');
    const count = Math.round(clamp((width * height) / (pieceSize * pieceSize), 8, 6000));
    const points = generateSeedPoints(width, height, count);
    const delaunay = new Delaunay(points);

    postStatus(requestId, 'Calculando colores...');
    const colors = computeGlassColors(delaunay, count, data, width, height);

    postStatus(requestId, 'Pintando el detalle fino...');
    const edgeMagnitude = computeSobelEdges(data, width, height);

    self.postMessage(
      {
        type: 'result',
        requestId,
        points: points.buffer,
        colors: colors.buffer,
        pointCount: count,
        edgeMagnitude: edgeMagnitude.buffer,
        width,
        height,
      },
      [points.buffer, colors.buffer, edgeMagnitude.buffer]
    );
  } catch (err) {
    self.postMessage({ type: 'error', requestId, message: err.message || String(err) });
  }
};

function postStatus(requestId, message) {
  self.postMessage({ type: 'status', requestId, message });
}

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

/**
 * Color medio (RGB) de cada celda de Voronoi, ya convertido a "color de
 * vidrio". Muestrea la imagen con un paso adaptativo para imágenes
 * grandes, reutilizando `delaunay.find(x, y, hint)` con la última celda
 * encontrada como pista para que la búsqueda sea casi O(1) al recorrer la
 * imagen en orden de barrido.
 */
function computeGlassColors(delaunay, pointCount, data, width, height) {
  const sums = new Float64Array(pointCount * 3);
  const counts = new Uint32Array(pointCount);

  const totalPixels = width * height;
  const targetSamples = 1_000_000;
  const stride = Math.max(1, Math.round(Math.sqrt(totalPixels / targetSamples)));

  let hint = 0;
  for (let y = 0; y < height; y += stride) {
    hint = delaunay.find(0, y, hint);
    for (let x = 0; x < width; x += stride) {
      hint = delaunay.find(x, y, hint);
      const p = (y * width + x) * 4;
      const base = hint * 3;
      sums[base] += data[p];
      sums[base + 1] += data[p + 1];
      sums[base + 2] += data[p + 2];
      counts[hint]++;
    }
  }

  const colors = new Uint8ClampedArray(pointCount * 3);
  for (let i = 0; i < pointCount; i++) {
    const base = i * 3;
    let r;
    let g;
    let b;
    if (counts[i] > 0) {
      r = sums[base] / counts[i];
      g = sums[base + 1] / counts[i];
      b = sums[base + 2] / counts[i];
    } else {
      // Celda muy pequeña que el muestreo por stride no tocó: usamos el
      // píxel exacto de la semilla como respaldo.
      const px = Math.min(width - 1, Math.max(0, Math.round(delaunay.points[i * 2])));
      const py = Math.min(height - 1, Math.max(0, Math.round(delaunay.points[i * 2 + 1])));
      const p = (py * width + px) * 4;
      r = data[p];
      g = data[p + 1];
      b = data[p + 2];
    }
    const [gr, gg, gb] = glassifyColor(r, g, b);
    colors[base] = gr;
    colors[base + 1] = gg;
    colors[base + 2] = gb;
  }

  return colors;
}

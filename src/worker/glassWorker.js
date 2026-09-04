// Web Worker: aquí ocurre todo el trabajo pesado (detección de bordes,
// generación de puntos y cálculo del color medio de cada celda de Voronoi)
// para no bloquear el hilo principal ni la UI.

import { Delaunay } from 'd3-delaunay';
import { computeSobelEdges } from '../modules/sobel.js';
import { generateSeedPoints } from '../modules/pointGenerator.js';

self.onmessage = (event) => {
  const msg = event.data;
  if (msg.type !== 'process') return;

  const { requestId, buffer, width, height, count, edgeBias } = msg;
  const data = new Uint8ClampedArray(buffer);

  try {
    postStatus(requestId, 'Analizando la imagen...');
    const edgeMap = edgeBias ? computeSobelEdges(data, width, height) : null;

    postStatus(requestId, 'Colocando piezas de vidrio...');
    const pointCount = Math.max(4, Math.min(count, width * height));
    const points = generateSeedPoints({ width, height, count: pointCount, edgeBias, edgeMap });

    postStatus(requestId, 'Calculando colores...');
    const delaunay = new Delaunay(points);
    const colors = computeCellColors(delaunay, points, pointCount, data, width, height);

    self.postMessage(
      {
        type: 'result',
        requestId,
        points: points.buffer,
        colors: colors.buffer,
        pointCount,
        width,
        height,
      },
      [points.buffer, colors.buffer]
    );
  } catch (err) {
    self.postMessage({ type: 'error', requestId, message: err.message || String(err) });
  }
};

function postStatus(requestId, message) {
  self.postMessage({ type: 'status', requestId, message });
}

/**
 * Calcula el color medio (RGB) de cada celda de Voronoi muestreando los
 * píxeles de la imagen original que caen dentro de ella. Usa
 * `delaunay.find` con una pista (hint) reutilizada entre consultas
 * consecutivas, lo que lo hace muy rápido al recorrer la imagen en orden
 * de barrido (scanline). Para imágenes grandes se aplica un muestreo con
 * paso (stride) adaptativo en vez de leer cada píxel.
 */
function computeCellColors(delaunay, points, pointCount, data, width, height) {
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
    if (counts[i] > 0) {
      colors[base] = sums[base] / counts[i];
      colors[base + 1] = sums[base + 1] / counts[i];
      colors[base + 2] = sums[base + 2] / counts[i];
    } else {
      // Celda muy pequeña que el muestreo por stride no tocó: usamos el
      // píxel exacto de la semilla como respaldo.
      const px = Math.min(width - 1, Math.max(0, Math.round(points[i * 2])));
      const py = Math.min(height - 1, Math.max(0, Math.round(points[i * 2 + 1])));
      const p = (py * width + px) * 4;
      colors[base] = data[p];
      colors[base + 1] = data[p + 1];
      colors[base + 2] = data[p + 2];
    }
  }

  return colors;
}

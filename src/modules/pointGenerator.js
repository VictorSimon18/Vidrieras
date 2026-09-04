// Generación de puntos semilla para el diagrama de Voronoi.
// Soporta muestreo uniforme aleatorio y muestreo ponderado hacia bordes
// de alto contraste (a partir del mapa de magnitud de Sobel).

/**
 * @param {object} opts
 * @param {number} opts.width
 * @param {number} opts.height
 * @param {number} opts.count número de puntos semilla a generar
 * @param {boolean} opts.edgeBias si se debe sesgar hacia los bordes
 * @param {Float32Array} [opts.edgeMap] magnitud de borde normalizada [0,1], width*height
 * @returns {Float64Array} pares [x0, y0, x1, y1, ...]
 */
export function generateSeedPoints({ width, height, count, edgeBias, edgeMap }) {
  const points = new Float64Array(count * 2);

  // Siempre incluimos las esquinas (como puntos "fantasma" cercanos a los
  // bordes del lienzo) para que el mosaico cubra toda la imagen sin huecos.
  let idx = 0;
  const corners = [
    [1, 1], [width - 1, 1], [1, height - 1], [width - 1, height - 1],
  ];
  for (const [cx, cy] of corners) {
    if (idx >= count) break;
    points[idx * 2] = cx;
    points[idx * 2 + 1] = cy;
    idx++;
  }

  if (edgeBias && edgeMap) {
    const sampler = buildWeightedSampler(edgeMap, width, height);
    // Mitad de los puntos restantes ponderados por bordes, mitad uniformes,
    // para mantener cobertura general además de detalle en los contornos.
    const remaining = count - idx;
    const weightedCount = Math.floor(remaining * 0.6);
    for (let i = 0; i < weightedCount && idx < count; i++, idx++) {
      const [x, y] = sampler();
      points[idx * 2] = x;
      points[idx * 2 + 1] = y;
    }
  }

  for (; idx < count; idx++) {
    points[idx * 2] = 1 + Math.random() * (width - 2);
    points[idx * 2 + 1] = 1 + Math.random() * (height - 2);
  }

  return points;
}

/**
 * Construye un muestreador que devuelve coordenadas [x, y] con probabilidad
 * proporcional a la magnitud de borde en esa zona, usando una grilla
 * reducida (para que el muestreo sea rápido incluso en imágenes grandes) y
 * un pequeño jitter para no apilar puntos exactamente en la misma celda.
 */
function buildWeightedSampler(edgeMap, width, height) {
  const gridCols = Math.min(width, 240);
  const gridRows = Math.min(height, 240);
  const cellW = width / gridCols;
  const cellH = height / gridRows;

  const weights = new Float64Array(gridCols * gridRows);
  let total = 0;
  const baseline = 0.05; // asegura algo de probabilidad incluso en zonas planas

  for (let gy = 0; gy < gridRows; gy++) {
    for (let gx = 0; gx < gridCols; gx++) {
      const px = Math.min(width - 1, Math.floor((gx + 0.5) * cellW));
      const py = Math.min(height - 1, Math.floor((gy + 0.5) * cellH));
      const w = baseline + edgeMap[py * width + px];
      weights[gy * gridCols + gx] = w;
      total += w;
    }
  }

  const cumulative = new Float64Array(weights.length);
  let acc = 0;
  for (let i = 0; i < weights.length; i++) {
    acc += weights[i] / total;
    cumulative[i] = acc;
  }

  return function sample() {
    const r = Math.random();
    let lo = 0;
    let hi = cumulative.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cumulative[mid] < r) lo = mid + 1;
      else hi = mid;
    }
    const gx = lo % gridCols;
    const gy = Math.floor(lo / gridCols);
    const x = Math.min(width - 1, Math.max(0, (gx + Math.random()) * cellW));
    const y = Math.min(height - 1, Math.max(0, (gy + Math.random()) * cellH));
    return [x, y];
  };
}

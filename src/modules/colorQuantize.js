// Cuantización de color: reduce la imagen a un número limitado de tonos
// (k-means sobre una muestra de píxeles) y "convierte a vidrio" cada tono
// resultante saturándolo, para imitar la paleta limitada y vívida del
// vidrio real usado en las vidrieras.

/**
 * @param {Uint8ClampedArray} data buffer RGBA (width*height*4)
 * @param {number} width
 * @param {number} height
 * @param {number} k número de colores de vidrio a generar
 * @returns {{ labels: Uint16Array, glassColors: Uint8ClampedArray }}
 *   labels: índice de color (0..k-1) por píxel, tamaño width*height
 *   glassColors: ternas [r,g,b] por color, tamaño k*3
 */
export function quantizeColors(data, width, height, k) {
  const totalPixels = width * height;
  const sampleTarget = Math.min(totalPixels, 20000);
  const stride = Math.max(1, Math.floor(totalPixels / sampleTarget));

  const samples = [];
  for (let p = 0; p < totalPixels; p += stride) {
    const o = p * 4;
    samples.push([data[o], data[o + 1], data[o + 2]]);
  }

  const centroids = initCentroids(samples, k);
  const assignments = new Int32Array(samples.length);

  const iterations = 8;
  for (let iter = 0; iter < iterations; iter++) {
    for (let i = 0; i < samples.length; i++) {
      assignments[i] = nearestCentroid(samples[i], centroids);
    }

    const sums = Array.from({ length: k }, () => [0, 0, 0, 0]);
    for (let i = 0; i < samples.length; i++) {
      const c = assignments[i];
      const s = samples[i];
      sums[c][0] += s[0];
      sums[c][1] += s[1];
      sums[c][2] += s[2];
      sums[c][3] += 1;
    }

    for (let c = 0; c < k; c++) {
      if (sums[c][3] === 0) {
        centroids[c] = samples[Math.floor(Math.random() * samples.length)].slice();
      } else {
        centroids[c] = [sums[c][0] / sums[c][3], sums[c][1] / sums[c][3], sums[c][2] / sums[c][3]];
      }
    }
  }

  const glassColors = new Uint8ClampedArray(k * 3);
  for (let c = 0; c < k; c++) {
    const [r, g, b] = glassify(centroids[c]);
    glassColors[c * 3] = r;
    glassColors[c * 3 + 1] = g;
    glassColors[c * 3 + 2] = b;
  }

  const labels = new Uint16Array(totalPixels);
  for (let p = 0; p < totalPixels; p++) {
    const o = p * 4;
    labels[p] = nearestCentroid([data[o], data[o + 1], data[o + 2]], centroids);
  }

  return { labels, glassColors };
}

function initCentroids(samples, k) {
  const indices = new Set();
  while (indices.size < Math.min(k, samples.length)) {
    indices.add(Math.floor(Math.random() * samples.length));
  }
  const centroids = Array.from(indices, (i) => samples[i].slice());
  while (centroids.length < k) {
    centroids.push(samples[Math.floor(Math.random() * samples.length)].slice());
  }
  return centroids;
}

function nearestCentroid(sample, centroids) {
  let best = 0;
  let bestDist = Infinity;
  for (let c = 0; c < centroids.length; c++) {
    const cc = centroids[c];
    const dr = sample[0] - cc[0];
    const dg = sample[1] - cc[1];
    const db = sample[2] - cc[2];
    const dist = dr * dr + dg * dg + db * db;
    if (dist < bestDist) {
      bestDist = dist;
      best = c;
    }
  }
  return best;
}

/**
 * Transforma un color medio de foto en un "color de vidrio": más saturado
 * y con la luminosidad ligeramente comprimida hacia el rango medio, que es
 * el aspecto típico del vidrio de color real.
 */
function glassify([r, g, b]) {
  const [h, s, l] = rgbToHsl(r, g, b);
  const newS = Math.min(0.92, s * 1.45 + 0.12);
  const newL = 0.5 + (l - 0.5) * 0.82;
  return hslToRgb(h, newS, newL);
}

function rgbToHsl(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h /= 6;
  return [h, s, l];
}

function hslToRgb(h, s, l) {
  if (s === 0) {
    const v = Math.round(l * 255);
    return [v, v, v];
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const r = hueToRgb(p, q, h + 1 / 3);
  const g = hueToRgb(p, q, h);
  const b = hueToRgb(p, q, h - 1 / 3);
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

function hueToRgb(p, q, t) {
  if (t < 0) t += 1;
  if (t > 1) t -= 1;
  if (t < 1 / 6) return p + (q - p) * 6 * t;
  if (t < 1 / 2) return q;
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
  return p;
}

// Renderizado del efecto vidriera a partir del resultado del worker
// (un mapa de piezas por píxel + su color de vidrio). Se ejecuta en el
// hilo principal porque es barato: pintar el relleno y el brillo es una
// pasada por píxel, y el "plomo" se obtiene detectando los píxeles donde
// cambia de pieza y dilatando esa línea al grosor pedido. Como no depende
// del worker, cambiar el grosor del plomo o el brillo del vidrio se
// redibuja al instante.

/**
 * @param {HTMLCanvasElement} canvas
 * @param {object} data
 * @param {Int32Array} data.labels pieza por píxel, tamaño width*height
 * @param {Uint8ClampedArray} data.pieceColors ternas [r,g,b] por pieza
 * @param {Float64Array} data.pieceCentroidX
 * @param {Float64Array} data.pieceCentroidY
 * @param {Uint32Array} data.pieceArea
 * @param {number} data.pieceCount
 * @param {number} data.width
 * @param {number} data.height
 * @param {number} data.lineWidth grosor del plomo en px
 * @param {number} data.glassIntensity intensidad del brillo, 0-1
 * @param {string} data.leadColor color de las líneas de plomo (hex)
 */
export function renderStainedGlass(canvas, data) {
  const {
    labels,
    pieceColors,
    pieceCentroidX,
    pieceCentroidY,
    pieceArea,
    pieceCount,
    width,
    height,
    lineWidth,
    glassIntensity,
    leadColor,
  } = data;

  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  const imageData = ctx.createImageData(width, height);
  const out = imageData.data;

  const pieceRadius = new Float32Array(pieceCount);
  for (let i = 0; i < pieceCount; i++) {
    pieceRadius[i] = Math.max(1, Math.sqrt(pieceArea[i] / Math.PI));
  }

  const total = width * height;
  for (let p = 0; p < total; p++) {
    const label = labels[p];
    const base = label * 3;
    let r = pieceColors[base];
    let g = pieceColors[base + 1];
    let b = pieceColors[base + 2];

    if (glassIntensity > 0) {
      const x = p % width;
      const y = (p / width) | 0;
      const rad = pieceRadius[label];
      const dx = (x - pieceCentroidX[label]) / rad;
      const dy = (y - pieceCentroidY[label]) / rad;

      const hdx = dx + 0.35;
      const hdy = dy + 0.35;
      const highlight = Math.max(0, 1 - Math.sqrt(hdx * hdx + hdy * hdy));
      const highlightAmt = highlight * highlight * 0.65 * glassIntensity;

      const sdx = dx - 0.4;
      const sdy = dy - 0.4;
      const shadow = Math.max(0, 1 - Math.sqrt(sdx * sdx + sdy * sdy));
      const shadowAmt = shadow * shadow * 0.4 * glassIntensity;

      r = r + (255 - r) * highlightAmt - r * shadowAmt;
      g = g + (255 - g) * highlightAmt - g * shadowAmt;
      b = b + (255 - b) * highlightAmt - b * shadowAmt;
    }

    const o = p * 4;
    out[o] = r;
    out[o + 1] = g;
    out[o + 2] = b;
    out[o + 3] = 255;
  }

  if (lineWidth > 0) {
    const boundary = detectBoundaries(labels, width, height);
    const radius = Math.max(1, Math.round(lineWidth / 2));
    const dilated = dilate(boundary, width, height, radius);
    const { r: lr, g: lg, b: lb } = hexToRgb(leadColor);
    for (let p = 0; p < total; p++) {
      if (!dilated[p]) continue;
      const o = p * 4;
      out[o] = lr;
      out[o + 1] = lg;
      out[o + 2] = lb;
      out[o + 3] = 255;
    }
  }

  ctx.putImageData(imageData, 0, 0);
}

function detectBoundaries(labels, width, height) {
  const total = width * height;
  const boundary = new Uint8Array(total);
  for (let y = 0; y < height; y++) {
    const rowBase = y * width;
    for (let x = 0; x < width; x++) {
      const p = rowBase + x;
      if (x === 0 || y === 0 || x === width - 1 || y === height - 1) {
        boundary[p] = 1;
        continue;
      }
      const v = labels[p];
      if (labels[p + 1] !== v || labels[p - 1] !== v || labels[p + width] !== v || labels[p - width] !== v) {
        boundary[p] = 1;
      }
    }
  }
  return boundary;
}

/** Dilatación separable (horizontal + vertical) con ventana deslizante: coste O(width*height), independiente del radio. */
function dilate(mask, width, height, radius) {
  return dilateVertical(dilateHorizontal(mask, width, height, radius), width, height, radius);
}

function dilateHorizontal(mask, width, height, radius) {
  const out = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    const rowBase = y * width;
    let count = 0;
    for (let k = 0; k <= radius && k < width; k++) if (mask[rowBase + k]) count++;
    for (let x = 0; x < width; x++) {
      out[rowBase + x] = count > 0 ? 1 : 0;
      const removeIdx = x - radius;
      const addIdx = x + radius + 1;
      if (removeIdx >= 0 && mask[rowBase + removeIdx]) count--;
      if (addIdx < width && mask[rowBase + addIdx]) count++;
    }
  }
  return out;
}

function dilateVertical(mask, width, height, radius) {
  const out = new Uint8Array(width * height);
  for (let x = 0; x < width; x++) {
    let count = 0;
    for (let k = 0; k <= radius && k < height; k++) if (mask[k * width + x]) count++;
    for (let y = 0; y < height; y++) {
      const p = y * width + x;
      out[p] = count > 0 ? 1 : 0;
      const removeY = y - radius;
      const addY = y + radius + 1;
      if (removeY >= 0 && mask[removeY * width + x]) count--;
      if (addY < height && mask[addY * width + x]) count++;
    }
  }
  return out;
}

function hexToRgb(hex) {
  const clean = hex.replace('#', '');
  const num = parseInt(clean, 16);
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
}

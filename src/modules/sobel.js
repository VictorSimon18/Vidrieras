// Detección de bordes tipo Sobel sobre un buffer de píxeles RGBA.
// Se ejecuta dentro del worker para no bloquear el hilo principal.

const KERNEL_X = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
const KERNEL_Y = [-1, -2, -1, 0, 0, 0, 1, 2, 1];

/**
 * Calcula la magnitud de gradiente (bordes) de una imagen RGBA.
 * @param {Uint8ClampedArray} data buffer RGBA (width*height*4)
 * @param {number} width
 * @param {number} height
 * @returns {Float32Array} magnitud de borde normalizada [0, 1], tamaño width*height
 */
export function computeSobelEdges(data, width, height) {
  const gray = new Float32Array(width * height);
  for (let i = 0, p = 0; i < gray.length; i++, p += 4) {
    gray[i] = 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2];
  }

  const magnitude = new Float32Array(width * height);
  let max = 1e-6;

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      let gx = 0;
      let gy = 0;
      let k = 0;
      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          const value = gray[(y + ky) * width + (x + kx)];
          gx += value * KERNEL_X[k];
          gy += value * KERNEL_Y[k];
          k++;
        }
      }
      const mag = Math.sqrt(gx * gx + gy * gy);
      magnitude[y * width + x] = mag;
      if (mag > max) max = mag;
    }
  }

  for (let i = 0; i < magnitude.length; i++) {
    magnitude[i] /= max;
  }

  return magnitude;
}

// Carga de imágenes: desde archivo (input / drag&drop) o una imagen de ejemplo
// generada por canvas. Todo ocurre en el cliente, nada se envía a un servidor.

const MAX_SIDE = 2000;

/**
 * Decodifica un File/Blob de imagen y lo escala (si hace falta) a un
 * ImageData listo para procesar, respetando un lado máximo de MAX_SIDE px.
 * @param {File|Blob} file
 * @returns {Promise<{imageData: ImageData, width: number, height: number}>}
 */
export async function loadImageFile(file) {
  const bitmap = await createImageBitmap(file);
  return bitmapToImageData(bitmap);
}

function bitmapToImageData(bitmap) {
  let { width, height } = bitmap;
  const largestSide = Math.max(width, height);
  if (largestSide > MAX_SIDE) {
    const scale = MAX_SIDE / largestSide;
    width = Math.round(width * scale);
    height = Math.round(height * scale);
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();

  const imageData = ctx.getImageData(0, 0, width, height);
  return { imageData, width, height };
}

/**
 * Genera una imagen sintética (formas y degradados de colores) para que el
 * usuario pueda probar la herramienta sin subir su propia foto.
 * @returns {{imageData: ImageData, width: number, height: number}}
 */
export function generateSampleImage() {
  const width = 900;
  const height = 650;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  const sky = ctx.createLinearGradient(0, 0, 0, height);
  sky.addColorStop(0, '#2a3a6e');
  sky.addColorStop(0.55, '#e0703f');
  sky.addColorStop(1, '#f6c453');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, height);

  const sun = ctx.createRadialGradient(
    width * 0.72, height * 0.38, 10,
    width * 0.72, height * 0.38, 160
  );
  sun.addColorStop(0, '#fff6d8');
  sun.addColorStop(1, 'rgba(255,246,216,0)');
  ctx.fillStyle = sun;
  ctx.beginPath();
  ctx.arc(width * 0.72, height * 0.38, 160, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#12213e';
  drawHillPath(ctx, height * 0.62, height, width, 0.55, 3);

  ctx.fillStyle = '#0a1428';
  drawHillPath(ctx, height * 0.74, height, width, 0.4, 5);

  ctx.strokeStyle = '#1c2c4a';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(width * 0.18, height * 0.66);
  for (let i = 0; i <= 8; i++) {
    const x = width * 0.18 + (i / 8) * width * 0.1;
    const y = height * 0.66 - Math.sin(i) * 14 - i * 6;
    ctx.lineTo(x, y);
  }
  ctx.stroke();

  ctx.fillStyle = '#f4d35e';
  for (let i = 0; i < 5; i++) {
    const cx = width * (0.08 + i * 0.045);
    const cy = height * (0.2 + (i % 2) * 0.05);
    ctx.beginPath();
    ctx.arc(cx, cy, 9 - i, 0, Math.PI * 2);
    ctx.fill();
  }

  const ctx2d = canvas.getContext('2d', { willReadFrequently: true });
  const imageData = ctx2d.getImageData(0, 0, width, height);
  return { imageData, width, height };
}

function drawHillPath(ctx, baseY, height, width, amplitudeFactor, waves) {
  ctx.beginPath();
  ctx.moveTo(0, height);
  ctx.lineTo(0, baseY);
  for (let x = 0; x <= width; x += width / 40) {
    const y = baseY - Math.sin((x / width) * Math.PI * waves) * height * 0.05 * amplitudeFactor;
    ctx.lineTo(x, y);
  }
  ctx.lineTo(width, height);
  ctx.closePath();
  ctx.fill();
}

/**
 * Dibuja un ImageData en un elemento canvas, redimensionándolo.
 * @param {HTMLCanvasElement} canvas
 * @param {ImageData} imageData
 */
export function drawImageDataToCanvas(canvas, imageData) {
  canvas.width = imageData.width;
  canvas.height = imageData.height;
  const ctx = canvas.getContext('2d');
  ctx.putImageData(imageData, 0, 0);
}

export { MAX_SIDE };

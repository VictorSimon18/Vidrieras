// Generación de puntos semilla para el mosaico de Voronoi: uniformemente
// aleatorios sobre el lienzo. A propósito no se sesgan hacia los bordes o
// el contorno de ningún objeto de la foto: las piezas de una vidriera real
// son figuras geométricas simples, no un calco de la silueta del pelo o
// la ropa.

/**
 * @param {number} width
 * @param {number} height
 * @param {number} count número de puntos semilla a generar
 * @returns {Float64Array} pares [x0, y0, x1, y1, ...]
 */
export function generateSeedPoints(width, height, count) {
  const points = new Float64Array(count * 2);
  for (let i = 0; i < count; i++) {
    points[i * 2] = 1 + Math.random() * (width - 2);
    points[i * 2 + 1] = 1 + Math.random() * (height - 2);
  }
  return points;
}

// Simplificación de polígonos (Visvalingam-Whyatt): elimina repetidamente
// el vértice cuyo triángulo con sus dos vecinos tiene menor área, hasta
// dejar como mucho `maxVertices` vértices. Un vidrio real se corta en
// piezas de pocos lados (triángulos, cuadriláteros, pentágonos, hexágonos
// como mucho), nunca formas con decenas de lados como las que produciría
// una celda de Voronoi compleja o el contorno exacto de una foto.

/**
 * @param {Array<[number, number]>} ring polígono cerrado (primer punto == último)
 * @param {number} maxVertices tope de vértices, p.ej. 6
 * @returns {Array<[number, number]>} polígono cerrado simplificado
 */
export function simplifyToMaxVertices(ring, maxVertices) {
  const points = ring.slice(0, ring.length - 1);
  if (points.length <= maxVertices) return ring;

  while (points.length > maxVertices) {
    const n = points.length;
    let minArea = Infinity;
    let minIndex = 0;
    for (let i = 0; i < n; i++) {
      const prev = points[(i - 1 + n) % n];
      const curr = points[i];
      const next = points[(i + 1) % n];
      const area = triangleArea(prev, curr, next);
      if (area < minArea) {
        minArea = area;
        minIndex = i;
      }
    }
    points.splice(minIndex, 1);
  }

  points.push(points[0]);
  return points;
}

function triangleArea(a, b, c) {
  return Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1])) / 2;
}

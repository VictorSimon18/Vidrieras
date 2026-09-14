// Renderizado del efecto vidriera: reconstruye el diagrama de Voronoi a
// partir de los puntos y colores calculados por el worker, y lo dibuja en
// el <canvas>. Se hace aquí (no en el worker) porque es barato — construir
// el Voronoi y pintar unos cientos de polígonos es cuestión de
// milisegundos — así que cambiar el grosor del plomo, el brillo o el
// detalle pintado se redibuja al instante sin volver a tocar el worker.
//
// Cada celda se simplifica a un polígono de como mucho 6 lados antes de
// rellenarla: el vidrio real se corta en piezas de pocos lados rectos, no
// en la silueta exacta de lo que haya debajo (una cara, un mechón de
// pelo...). El plomo, en cambio, se traza sobre la malla de Voronoi
// original (sin simplificar) para que las piezas vecinas siempre encajen
// sin huecos ni solapes.

import { Delaunay } from 'd3-delaunay';
import { simplifyToMaxVertices } from './polygonSimplify.js';

const MAX_SIDES = 6;

/**
 * @param {HTMLCanvasElement} canvas
 * @param {object} data
 * @param {Float64Array} data.points pares [x0,y0,x1,y1,...]
 * @param {number} data.pointCount
 * @param {Uint8ClampedArray} data.colors ternas [r0,g0,b0,r1,g1,b1,...]
 * @param {Uint8ClampedArray} data.edgeMagnitude mapa de bordes de la imagen original, para el detalle pintado
 * @param {number} data.width
 * @param {number} data.height
 * @param {number} data.lineWidth grosor del plomo en px
 * @param {number} data.glassIntensity intensidad del brillo, 0-1
 * @param {number} data.detailAmount intensidad del detalle pintado (grisalla), 0-1
 * @param {string} data.leadColor color de las líneas de plomo
 */
export function renderStainedGlass(canvas, data) {
  const { points, pointCount, colors, edgeMagnitude, width, height, lineWidth, glassIntensity, detailAmount, leadColor } = data;

  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, width, height);

  const delaunay = new Delaunay(points);
  const voronoi = delaunay.voronoi([0, 0, width, height]);

  // Cada celda se simplifica de forma independiente, así que sus lados
  // recortados no siempre coinciden exactamente con los de la celda
  // vecina: por eso primero se rellena la celda exacta de Voronoi (sin
  // huecos posibles, es la teselación real) y encima se repinta la
  // versión simplificada con el mismo color. Cualquier pequeño resquicio
  // que deje la simplificación queda cubierto por el color correcto de la
  // propia celda en vez de dejar un hueco.
  for (let i = 0; i < pointCount; i++) {
    const cell = voronoi.cellPolygon(i);
    if (!cell || cell.length < 4) continue; // < 4 porque el anillo viene cerrado (repite el primer punto)

    const base = i * 3;
    const fillStyle = `rgb(${colors[base]}, ${colors[base + 1]}, ${colors[base + 2]})`;
    fillPolygon(ctx, cell, fillStyle);
  }

  for (let i = 0; i < pointCount; i++) {
    const cell = voronoi.cellPolygon(i);
    if (!cell || cell.length < 4) continue;

    const polygon = simplifyToMaxVertices(cell, MAX_SIDES);
    const base = i * 3;
    const fillStyle = `rgb(${colors[base]}, ${colors[base + 1]}, ${colors[base + 2]})`;

    fillPolygon(ctx, polygon, fillStyle);

    if (glassIntensity > 0) {
      drawGlassHighlight(ctx, polygon, points[i * 2], points[i * 2 + 1], glassIntensity);
    }
  }

  if (lineWidth > 0) {
    ctx.beginPath();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    voronoi.render(ctx);
    ctx.lineWidth = lineWidth;
    ctx.strokeStyle = leadColor;
    ctx.stroke();
  }

  if (detailAmount > 0 && edgeMagnitude) {
    paintFineDetail(ctx, edgeMagnitude, width, height, detailAmount, leadColor);
  }
}

function fillPolygon(ctx, polygon, fillStyle) {
  ctx.beginPath();
  ctx.moveTo(polygon[0][0], polygon[0][1]);
  for (let k = 1; k < polygon.length; k++) {
    ctx.lineTo(polygon[k][0], polygon[k][1]);
  }
  ctx.closePath();
  ctx.fillStyle = fillStyle;
  ctx.fill();
}

/**
 * Simula textura de vidrio: un brillo radial suave desplazado hacia la
 * esquina superior izquierda de la celda y una sombra tenue en la esquina
 * opuesta, para dar sensación de volumen al fragmento de cristal.
 */
function drawGlassHighlight(ctx, polygon, cx, cy, intensity) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of polygon) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const radius = Math.max(maxX - minX, maxY - minY) * 0.75;
  if (!(radius > 0)) return;

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(polygon[0][0], polygon[0][1]);
  for (let k = 1; k < polygon.length; k++) ctx.lineTo(polygon[k][0], polygon[k][1]);
  ctx.closePath();
  ctx.clip();

  const hlX = cx - radius * 0.3;
  const hlY = cy - radius * 0.3;
  const highlight = ctx.createRadialGradient(hlX, hlY, 0, hlX, hlY, radius);
  highlight.addColorStop(0, `rgba(255,255,255,${0.55 * intensity})`);
  highlight.addColorStop(0.5, `rgba(255,255,255,${0.12 * intensity})`);
  highlight.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = highlight;
  ctx.fillRect(minX, minY, maxX - minX, maxY - minY);

  const shX = cx + radius * 0.35;
  const shY = cy + radius * 0.35;
  const shadow = ctx.createRadialGradient(shX, shY, 0, shX, shY, radius);
  shadow.addColorStop(0, `rgba(0,0,0,${0.18 * intensity})`);
  shadow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = shadow;
  ctx.fillRect(minX, minY, maxX - minX, maxY - minY);

  ctx.restore();
}

/**
 * Detalle "pintado" (grisalla): un trazo oscuro fino sobre el rostro, la
 * ropa, etc., a partir de los bordes de la foto original. No fragmenta el
 * vidrio en más piezas, solo se pinta encima, igual que el detalle fino
 * de una vidriera real.
 */
function paintFineDetail(ctx, edgeMagnitude, width, height, detailAmount, leadColor) {
  const imageData = ctx.getImageData(0, 0, width, height);
  const out = imageData.data;
  const { r: lr, g: lg, b: lb } = hexToRgb(leadColor);
  const threshold = 255 * (1 - detailAmount * 0.85);

  const total = width * height;
  for (let p = 0; p < total; p++) {
    const mag = edgeMagnitude[p];
    if (mag <= threshold) continue;
    const alpha = Math.min(1, ((mag - threshold) / (255 - threshold)) * 0.9);
    const o = p * 4;
    out[o] = out[o] + (lr - out[o]) * alpha;
    out[o + 1] = out[o + 1] + (lg - out[o + 1]) * alpha;
    out[o + 2] = out[o + 2] + (lb - out[o + 2]) * alpha;
  }

  ctx.putImageData(imageData, 0, 0);
}

function hexToRgb(hex) {
  const clean = hex.replace('#', '');
  const num = parseInt(clean, 16);
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
}

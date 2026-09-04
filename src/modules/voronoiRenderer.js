// Renderizado del efecto vidriera sobre un <canvas>: rellena cada celda de
// Voronoi con su color medio, dibuja las líneas de "plomo" y añade un
// brillo/gradiente sutil para simular la textura del vidrio.

import { Delaunay } from 'd3-delaunay';

/**
 * @param {HTMLCanvasElement} canvas
 * @param {object} data
 * @param {Float64Array} data.points pares [x0,y0,x1,y1,...]
 * @param {number} data.pointCount
 * @param {Uint8ClampedArray} data.colors ternas [r0,g0,b0,r1,g1,b1,...]
 * @param {number} data.width
 * @param {number} data.height
 * @param {number} data.lineWidth grosor del plomo en px
 * @param {number} data.glassIntensity intensidad del brillo, 0-1
 * @param {string} data.leadColor color de las líneas de plomo
 */
export function renderStainedGlass(canvas, data) {
  const { points, pointCount, colors, width, height, lineWidth, glassIntensity, leadColor } = data;

  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, width, height);

  const delaunay = new Delaunay(points);
  const voronoi = delaunay.voronoi([0, 0, width, height]);

  for (let i = 0; i < pointCount; i++) {
    const polygon = voronoi.cellPolygon(i);
    if (!polygon || polygon.length < 3) continue;

    const base = i * 3;
    const r = colors[base];
    const g = colors[base + 1];
    const b = colors[base + 2];

    fillPolygon(ctx, polygon, `rgb(${r}, ${g}, ${b})`);

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

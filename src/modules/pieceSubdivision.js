// Subdivisión de piezas: las regiones de vidrio grandes y planas (cielo,
// fondo, piel...) se cortan en varias piezas más pequeñas, como ocurre en
// una vidriera real (una lámina de vidrio de un color se corta en varios
// trozos). Las regiones ya pequeñas (detalles como ojos o labios) se dejan
// como una única pieza. El corte usa un diagrama de Delaunay local por
// región y `delaunay.find(x, y, hint)` para asignar cada píxel a su
// fragmento más cercano de forma muy rápida.

import { Delaunay } from 'd3-delaunay';

const MAX_SUBPIECES_PER_REGION = 400;

/**
 * @param {Int32Array} regionLabels región por píxel (0..regionCount-1)
 * @param {number} regionCount
 * @param {Int32Array} regionColorIndex índice de color de vidrio por región
 * @param {Uint32Array} regionArea nº de píxeles por región
 * @param {number} width
 * @param {number} height
 * @param {number} targetPieceArea área objetivo (en píxeles) de cada pieza final
 * @returns {{ labels: Int32Array, pieceCount: number, pieceColorIndex: Int32Array,
 *             pieceArea: Uint32Array, pieceCentroidX: Float64Array, pieceCentroidY: Float64Array }}
 */
export function subdivideRegions(regionLabels, regionCount, regionColorIndex, regionArea, width, height, targetPieceArea) {
  const total = width * height;

  // Bucketing (counting sort): agrupa los índices de píxel por región,
  // preservando el orden de barrido (row-major), ideal para `find(hint)`.
  const starts = new Uint32Array(regionCount + 1);
  for (let r = 0; r < regionCount; r++) starts[r + 1] = starts[r] + regionArea[r];
  const cursor = starts.slice(0, regionCount);
  const bucket = new Int32Array(total);
  for (let p = 0; p < total; p++) {
    const r = regionLabels[p];
    bucket[cursor[r]++] = p;
  }

  const finalLabels = new Int32Array(total);
  const pieceColorIndex = [];
  const pieceArea = [];
  const pieceCentroidX = [];
  const pieceCentroidY = [];
  let nextPieceId = 0;

  for (let r = 0; r < regionCount; r++) {
    const start = starts[r];
    const end = starts[r + 1];
    const count = end - start;
    const targetCount = Math.min(MAX_SUBPIECES_PER_REGION, Math.max(1, Math.round(count / targetPieceArea)));

    if (targetCount <= 1) {
      const id = nextPieceId++;
      let sumX = 0;
      let sumY = 0;
      for (let i = start; i < end; i++) {
        const p = bucket[i];
        finalLabels[p] = id;
        sumX += p % width;
        sumY += (p / width) | 0;
      }
      pieceColorIndex.push(regionColorIndex[r]);
      pieceArea.push(count);
      pieceCentroidX.push(sumX / count);
      pieceCentroidY.push(sumY / count);
      continue;
    }

    const points = new Float64Array(targetCount * 2);
    for (let s = 0; s < targetCount; s++) {
      const p = bucket[start + Math.floor(Math.random() * count)];
      points[s * 2] = p % width;
      points[s * 2 + 1] = (p / width) | 0;
    }
    const delaunay = new Delaunay(points);

    const baseId = nextPieceId;
    const subArea = new Float64Array(targetCount);
    const subSumX = new Float64Array(targetCount);
    const subSumY = new Float64Array(targetCount);

    let hint = 0;
    for (let i = start; i < end; i++) {
      const p = bucket[i];
      const x = p % width;
      const y = (p / width) | 0;
      hint = delaunay.find(x, y, hint);
      finalLabels[p] = baseId + hint;
      subArea[hint]++;
      subSumX[hint] += x;
      subSumY[hint] += y;
    }

    for (let s = 0; s < targetCount; s++) {
      pieceColorIndex.push(regionColorIndex[r]);
      pieceArea.push(subArea[s]);
      pieceCentroidX.push(subArea[s] > 0 ? subSumX[s] / subArea[s] : points[s * 2]);
      pieceCentroidY.push(subArea[s] > 0 ? subSumY[s] / subArea[s] : points[s * 2 + 1]);
    }
    nextPieceId += targetCount;
  }

  return {
    labels: finalLabels,
    pieceCount: nextPieceId,
    pieceColorIndex: Int32Array.from(pieceColorIndex),
    pieceArea: Uint32Array.from(pieceArea),
    pieceCentroidX: Float64Array.from(pieceCentroidX),
    pieceCentroidY: Float64Array.from(pieceCentroidY),
  };
}

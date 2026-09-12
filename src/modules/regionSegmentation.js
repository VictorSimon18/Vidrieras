// Segmentación en regiones: agrupa en componentes conexas los píxeles que
// comparten el mismo color de vidrio (tras la cuantización), y luego funde
// las regiones diminutas (ruido) con su vecina más próxima para evitar
// piezas de vidrio de un solo píxel.

/**
 * Etiquetado de componentes conexas (4-vecindad) sobre el mapa de colores
 * cuantizados.
 * @param {Uint16Array} colorLabels índice de color por píxel
 * @param {number} width
 * @param {number} height
 * @returns {{ labels: Int32Array, count: number, colorIndex: Int32Array, area: Uint32Array }}
 */
export function connectedComponents(colorLabels, width, height) {
  const total = width * height;
  const labels = new Int32Array(total).fill(-1);
  const colorIndex = [];
  const area = [];
  const stack = new Int32Array(total);

  let nextId = 0;
  for (let start = 0; start < total; start++) {
    if (labels[start] !== -1) continue;

    const color = colorLabels[start];
    const id = nextId++;
    let count = 0;
    let sp = 0;
    stack[sp++] = start;
    labels[start] = id;

    while (sp > 0) {
      const p = stack[--sp];
      count++;
      const x = p % width;
      const y = (p / width) | 0;

      if (x > 0) {
        const n = p - 1;
        if (labels[n] === -1 && colorLabels[n] === color) {
          labels[n] = id;
          stack[sp++] = n;
        }
      }
      if (x < width - 1) {
        const n = p + 1;
        if (labels[n] === -1 && colorLabels[n] === color) {
          labels[n] = id;
          stack[sp++] = n;
        }
      }
      if (y > 0) {
        const n = p - width;
        if (labels[n] === -1 && colorLabels[n] === color) {
          labels[n] = id;
          stack[sp++] = n;
        }
      }
      if (y < height - 1) {
        const n = p + width;
        if (labels[n] === -1 && colorLabels[n] === color) {
          labels[n] = id;
          stack[sp++] = n;
        }
      }
    }

    colorIndex.push(color);
    area.push(count);
  }

  return {
    labels,
    count: nextId,
    colorIndex: Int32Array.from(colorIndex),
    area: Uint32Array.from(area),
  };
}

/**
 * Funde las regiones menores que `minArea` con la región vecina más
 * cercana, mediante un BFS multi-fuente sembrado desde todas las regiones
 * "grandes" a la vez: cada píxel de una región pequeña queda finalmente
 * asignado a la región grande cuya "onda" lo alcanza primero, lo que en la
 * práctica equivale a fundirlo con su vecina más próxima.
 */
export function mergeSmallRegions(componentLabels, componentCount, colorIndex, area, width, height, minArea) {
  const total = width * height;

  let largestId = 0;
  for (let i = 1; i < componentCount; i++) {
    if (area[i] > area[largestId]) largestId = i;
  }

  const keep = new Uint8Array(componentCount);
  for (let i = 0; i < componentCount; i++) {
    keep[i] = area[i] >= minArea || i === largestId ? 1 : 0;
  }

  const owner = new Int32Array(total);
  const queue = new Int32Array(total);
  let qHead = 0;
  let qTail = 0;

  for (let p = 0; p < total; p++) {
    const comp = componentLabels[p];
    if (keep[comp]) {
      owner[p] = comp;
      queue[qTail++] = p;
    } else {
      owner[p] = -1;
    }
  }

  while (qHead < qTail) {
    const p = queue[qHead++];
    const o = owner[p];
    const x = p % width;
    const y = (p / width) | 0;

    if (x > 0) {
      const n = p - 1;
      if (owner[n] === -1) {
        owner[n] = o;
        queue[qTail++] = n;
      }
    }
    if (x < width - 1) {
      const n = p + 1;
      if (owner[n] === -1) {
        owner[n] = o;
        queue[qTail++] = n;
      }
    }
    if (y > 0) {
      const n = p - width;
      if (owner[n] === -1) {
        owner[n] = o;
        queue[qTail++] = n;
      }
    }
    if (y < height - 1) {
      const n = p + width;
      if (owner[n] === -1) {
        owner[n] = o;
        queue[qTail++] = n;
      }
    }
  }

  const remap = new Int32Array(componentCount).fill(-1);
  let nextId = 0;
  const newColorIndex = [];
  for (let i = 0; i < componentCount; i++) {
    if (keep[i]) {
      remap[i] = nextId++;
      newColorIndex.push(colorIndex[i]);
    }
  }

  const labels = new Int32Array(total);
  const newArea = new Uint32Array(nextId);
  for (let p = 0; p < total; p++) {
    const id = remap[owner[p]];
    labels[p] = id;
    newArea[id]++;
  }

  return {
    labels,
    count: nextId,
    colorIndex: Int32Array.from(newColorIndex),
    area: newArea,
  };
}

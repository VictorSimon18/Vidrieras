// Punto de entrada para la build "standalone": idéntico a main.js salvo en
// cómo se crea el Web Worker. Aquí no existe un archivo worker separado que
// el navegador pueda solicitar (todo vive en un único .html), así que el
// código del worker se lee de un <script type="text/plain"> embebido y se
// instancia a partir de un Blob.
import { loadImageFile, generateSampleImage, drawImageDataToCanvas } from './modules/imageLoader.js';
import { renderStainedGlass } from './modules/segmentRenderer.js';
import { debounce, setupTabs, setStatus } from './modules/ui.js';

const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('file-input');
const pickFileBtn = document.getElementById('pick-file-btn');
const sampleImageBtn = document.getElementById('sample-image-btn');

const colorCountSlider = document.getElementById('color-count-slider');
const colorCountValue = document.getElementById('color-count-value');
const pieceSizeSlider = document.getElementById('piece-size-slider');
const pieceSizeValue = document.getElementById('piece-size-value');
const detailSlider = document.getElementById('detail-slider');
const detailValue = document.getElementById('detail-value');
const lineWidthSlider = document.getElementById('line-width-slider');
const lineWidthValue = document.getElementById('line-width-value');
const glassIntensitySlider = document.getElementById('glass-intensity-slider');
const glassIntensityValue = document.getElementById('glass-intensity-value');
const leadingColorCheckbox = document.getElementById('leading-color-checkbox');

const generateBtn = document.getElementById('generate-btn');
const downloadBtn = document.getElementById('download-btn');
const statusLine = document.getElementById('status-line');
const emptyState = document.getElementById('empty-state');

const resultCanvas = document.getElementById('result-canvas');
const originalCanvas = document.getElementById('original-canvas');
const resultWrap = document.getElementById('result-wrap');
const originalWrap = document.getElementById('original-wrap');
const tabButtons = document.querySelectorAll('.tab-btn');

const LEAD_COLOR_DARK = '#15130f';
const LEAD_COLOR_WARM = '#3a2410';

/** @type {{imageData: ImageData, width: number, height: number} | null} */
let currentImage = null;

/** Última salida del worker: piezas + colores, reutilizable para re-render rápido */
let lastComputeResult = null;

let hasGeneratedOnce = false;
let requestCounter = 0;
let currentRequestId = 0;

const workerSource = document.getElementById('glass-worker-source').textContent;
const workerBlobUrl = URL.createObjectURL(new Blob([workerSource], { type: 'application/javascript' }));
const worker = new Worker(workerBlobUrl);

worker.onmessage = (event) => {
  const msg = event.data;
  if (msg.requestId !== currentRequestId) return; // respuesta obsoleta, ignorar

  if (msg.type === 'status') {
    setStatus(statusLine, msg.message);
  } else if (msg.type === 'result') {
    lastComputeResult = {
      labels: new Int32Array(msg.labels),
      pieceColors: new Uint8ClampedArray(msg.pieceColors),
      pieceCentroidX: new Float64Array(msg.pieceCentroidX),
      pieceCentroidY: new Float64Array(msg.pieceCentroidY),
      pieceArea: new Uint32Array(msg.pieceArea),
      pieceCount: msg.pieceCount,
      edgeMagnitude: new Uint8ClampedArray(msg.edgeMagnitude),
      width: msg.width,
      height: msg.height,
    };
    renderNow();
    emptyState.hidden = true;
    downloadBtn.disabled = false;
    generateBtn.disabled = false;
    setStatus(statusLine, `Listo · ${msg.pieceCount} piezas`);
  } else if (msg.type === 'error') {
    generateBtn.disabled = false;
    setStatus(statusLine, `Error: ${msg.message}`, true);
  }
};

worker.onerror = (err) => {
  generateBtn.disabled = false;
  setStatus(statusLine, `Error del worker: ${err.message}`, true);
};

// ---------- Carga de imagen ----------

function setImage(loaded) {
  currentImage = loaded;
  lastComputeResult = null;
  drawImageDataToCanvas(originalCanvas, loaded.imageData);
  generateBtn.disabled = false;
  downloadBtn.disabled = true;
  hasGeneratedOnce = false;
  emptyState.hidden = false;
  setStatus(statusLine, `Imagen cargada: ${loaded.width}×${loaded.height}px. Pulsa "Generar vidriera".`);
}

async function handleFiles(fileList) {
  const file = fileList && fileList[0];
  if (!file || !file.type.startsWith('image/')) return;
  try {
    setStatus(statusLine, 'Cargando imagen...');
    const loaded = await loadImageFile(file);
    setImage(loaded);
  } catch (err) {
    setStatus(statusLine, `No se pudo cargar la imagen: ${err.message}`, true);
  }
}

fileInput.addEventListener('change', (e) => handleFiles(e.target.files));
pickFileBtn.addEventListener('click', () => fileInput.click());
dropzone.addEventListener('click', (e) => {
  if (e.target === pickFileBtn || e.target === sampleImageBtn) return;
  fileInput.click();
});

sampleImageBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  setImage(generateSampleImage());
});

['dragenter', 'dragover'].forEach((evtName) => {
  dropzone.addEventListener(evtName, (e) => {
    e.preventDefault();
    dropzone.classList.add('dragover');
  });
});
['dragleave', 'dragend', 'drop'].forEach((evtName) => {
  dropzone.addEventListener(evtName, (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
  });
});
dropzone.addEventListener('drop', (e) => {
  handleFiles(e.dataTransfer.files);
});

// ---------- Procesamiento (worker) ----------

function runFullProcess() {
  if (!currentImage) return;
  hasGeneratedOnce = true;
  generateBtn.disabled = true;
  currentRequestId = ++requestCounter;

  const { imageData, width, height } = currentImage;
  const bufferCopy = imageData.data.buffer.slice(0);

  setStatus(statusLine, 'Procesando...');
  worker.postMessage(
    {
      type: 'process',
      requestId: currentRequestId,
      buffer: bufferCopy,
      width,
      height,
      colorCount: Number(colorCountSlider.value),
      pieceSize: Number(pieceSizeSlider.value),
    },
    [bufferCopy]
  );
}

function renderNow() {
  if (!lastComputeResult) return;
  renderStainedGlass(resultCanvas, {
    ...lastComputeResult,
    lineWidth: Number(lineWidthSlider.value),
    glassIntensity: Number(glassIntensitySlider.value) / 100,
    detailAmount: Number(detailSlider.value) / 100,
    leadColor: leadingColorCheckbox.checked ? LEAD_COLOR_WARM : LEAD_COLOR_DARK,
  });
}

const debouncedFullProcess = debounce(() => {
  if (hasGeneratedOnce) runFullProcess();
}, 350);

const debouncedRenderOnly = debounce(renderNow, 80);

generateBtn.addEventListener('click', runFullProcess);

colorCountSlider.addEventListener('input', () => {
  colorCountValue.textContent = `${colorCountSlider.value} colores`;
  debouncedFullProcess();
});
pieceSizeSlider.addEventListener('input', () => {
  pieceSizeValue.textContent = `${pieceSizeSlider.value} px`;
  debouncedFullProcess();
});
detailSlider.addEventListener('input', () => {
  detailValue.textContent = `${detailSlider.value}%`;
  debouncedRenderOnly();
});

lineWidthSlider.addEventListener('input', () => {
  lineWidthValue.textContent = `${lineWidthSlider.value} px`;
  debouncedRenderOnly();
});
glassIntensitySlider.addEventListener('input', () => {
  glassIntensityValue.textContent = `${glassIntensitySlider.value}%`;
  debouncedRenderOnly();
});
leadingColorCheckbox.addEventListener('change', debouncedRenderOnly);

// ---------- Descarga ----------

downloadBtn.addEventListener('click', () => {
  resultCanvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'vidriera.png';
    a.click();
    URL.revokeObjectURL(url);
  }, 'image/png');
});

// ---------- Tabs ----------

setupTabs(tabButtons, { result: resultWrap, original: originalWrap });

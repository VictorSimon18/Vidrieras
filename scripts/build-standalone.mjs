// Genera vidrieras.html: una versión 100% autocontenida de la app (CSS, JS
// y el Web Worker inlineados) que se puede abrir con doble clic, sin
// servidor ni "npm run dev". Se regenera con `npm run build:standalone`
// cada vez que cambie el código fuente en src/ o index.html.
import { build } from 'esbuild';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const p = (...segments) => path.join(root, ...segments);

async function bundle(entryPoint) {
  const result = await build({
    entryPoints: [entryPoint],
    bundle: true,
    format: 'iife',
    target: 'es2020',
    minify: true,
    write: false,
    logLevel: 'warning',
  });
  return result.outputFiles[0].text;
}

// Evita que un `</script>` accidental dentro del JS empaquetado cierre la
// etiqueta <script> que lo envuelve en el HTML final.
function escapeClosingScriptTag(code) {
  return code.replace(/<\/script/gi, '<\\/script');
}

/** Extrae el contenido de <body>...</body> de index.html, sin el <script> del build de Vite. */
function extractBody(indexHtml) {
  const match = indexHtml.match(/<body>([\s\S]*)<\/body>/);
  if (!match) throw new Error('No se encontró <body> en index.html');
  return match[1].replace(/\s*<script[^>]*src="\/src\/main\.js"[^>]*>\s*<\/script>\s*$/, '').trimEnd();
}

async function main() {
  const [workerCode, mainCode, css, faviconSvg, indexHtml] = await Promise.all([
    bundle(p('src/worker/glassWorker.js')),
    bundle(p('src/standalone-entry.js')),
    readFile(p('src/style.css'), 'utf-8'),
    readFile(p('public/favicon.svg'), 'utf-8'),
    readFile(p('index.html'), 'utf-8'),
  ]);

  const faviconDataUri = `data:image/svg+xml;base64,${Buffer.from(faviconSvg, 'utf-8').toString('base64')}`;
  const body = extractBody(indexHtml).replace(
    'src="/favicon.svg"',
    `src="${faviconDataUri}"`
  );

  const html = `<!doctype html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="${faviconDataUri}" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Vidrieras — Efecto de vitral para imágenes</title>
    <style>
${css}
    </style>
  </head>
  <body>
${body}

    <script type="text/plain" id="glass-worker-source">${escapeClosingScriptTag(workerCode)}</script>
    <script>${escapeClosingScriptTag(mainCode)}</script>
  </body>
</html>
`;

  await writeFile(p('vidrieras.html'), html, 'utf-8');
  console.log(`vidrieras.html generado (${(html.length / 1024).toFixed(0)} KB)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

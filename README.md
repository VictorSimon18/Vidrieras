# Vidrieras

Aplicación web que convierte cualquier imagen en un efecto de **vidriera** (stained glass):
un mosaico de piezas de colores planos separadas por líneas gruesas oscuras que simulan
el plomo de una vidriera.

Todo el procesamiento ocurre **en el navegador**, usando la Canvas API y un Web Worker.
No hay backend: ninguna imagen sale nunca del dispositivo del usuario, y el proyecto se
puede desplegar como sitio estático.

## La forma más rápida de probarlo: `vidrieras.html`

El repositorio incluye **[`vidrieras.html`](./vidrieras.html)**, un único archivo HTML
autocontenido (CSS, JS y el Web Worker inlineados) que funciona con solo **hacer doble
clic** sobre él y abrirlo en el navegador. No hace falta Node, ni `npm install`, ni
ningún servidor: basta con el archivo.

Es exactamente la misma app: mismo pipeline, mismos controles, worker incluido para no
bloquear la interfaz. La única diferencia con el resto del proyecto es que aquí el
Web Worker no vive en un archivo aparte (eso no es posible al abrir un HTML con
`file://`), sino que su código va embebido en un `<script type="text/plain">` dentro del
propio HTML y se instancia en tiempo de ejecución a partir de un `Blob`.

Este archivo se genera con `npm run build:standalone` (ver más abajo) a partir del
código fuente de `src/`, así que si modificas algo ahí, vuelve a ejecutar ese comando
para regenerarlo.

## Cómo funciona

1. Se cargan los píxeles de la imagen en un `ImageData` (limitando el lado más largo a
   2000 px para mantener el rendimiento).
2. Se genera un conjunto de puntos semilla, de dos formas posibles:
   - **Aleatoria**, con densidad configurable (nº de piezas).
   - **Sesgada a bordes**: se calcula un mapa de bordes con el operador de **Sobel** y se
     muestrean más puntos en las zonas de alto contraste, para que las piezas respeten
     mejor los contornos importantes de la imagen.
3. Con esos puntos se construye un diagrama de **Voronoi** (usando
   [`d3-delaunay`](https://github.com/d3/d3-delaunay)).
4. Para cada celda se calcula el color medio de los píxeles originales que caen dentro, y
   se rellena la celda con ese color plano.
5. Se dibujan los bordes de todas las celdas con una línea gruesa oscura (el "plomo"),
   de grosor configurable.
6. Opcionalmente se añade un brillo/gradiente radial suave dentro de cada pieza para dar
   sensación de textura de vidrio.

Los pasos 2–4 (los más costosos computacionalmente) se ejecutan en un **Web Worker**, así
que la interfaz nunca se bloquea mientras se procesa una imagen.

## Estructura del proyecto

```
index.html                    Estructura de la página (controles + canvases)
vidrieras.html                Build standalone: todo en un único archivo (generado)
scripts/
  build-standalone.mjs        Genera vidrieras.html a partir de src/ con esbuild
src/
  main.js                     Orquestador (build Vite): wiring de la UI, worker y render
  standalone-entry.js         Igual que main.js, pero usado por el build standalone
  style.css                   Estilos
  modules/
    imageLoader.js            Carga de archivos / drag&drop / imagen de ejemplo
    sobel.js                  Detección de bordes (usado dentro del worker)
    pointGenerator.js         Generación de puntos semilla (usado dentro del worker)
    voronoiRenderer.js         Pintado del resultado en el <canvas> (celdas, plomo, brillo)
    ui.js                     Utilidades de UI (debounce, tabs, mensajes de estado)
  worker/
    glassWorker.js            Web Worker: Sobel + puntos + Delaunay/Voronoi + color medio
```

## Requisitos

- Node.js 18 o superior
- npm

## Instalación y desarrollo

```bash
npm install
npm run dev
```

Esto arranca el servidor de desarrollo de [Vite](https://vitejs.dev/) (por defecto en
`http://localhost:5173`) con recarga en caliente.

## Build de producción

```bash
npm run build
```

Genera una carpeta `dist/` con HTML, CSS y JS estáticos, lista para desplegar en
cualquier hosting estático (Netlify, Vercel, GitHub Pages, S3, etc.). No requiere
ningún servidor ni configuración especial: son solo ficheros estáticos.

Para previsualizar el build de producción localmente:

```bash
npm run preview
```

## Regenerar el HTML standalone

```bash
npm run build:standalone
```

Vuelve a generar [`vidrieras.html`](./vidrieras.html) a partir del código en `src/`
(usando [esbuild](https://esbuild.github.io/) para empaquetar el JS y el Web Worker en
línea). Ejecútalo cada vez que cambies algo en `src/` si quieres que ese archivo quede
al día.

## Uso

1. Arrastra una imagen sobre la zona de carga (o haz clic para elegirla desde el
   selector de archivos). También puedes probar con el botón **"Usar imagen de
   ejemplo"**, que genera una imagen sintética sin necesidad de subir ningún archivo.
2. Ajusta los controles a tu gusto:
   - **Tamaño de las piezas**: número de puntos del Voronoi (más puntos = piezas más
     pequeñas y mosaico más fino).
   - **Grosor del plomo**: ancho de las líneas oscuras que separan las piezas.
   - **Brillo del vidrio**: intensidad del gradiente que simula la textura del cristal.
   - **Sesgar piezas hacia los bordes**: activa/desactiva el muestreo ponderado por
     contornos (Sobel).
   - **Plomo con tono cálido**: alterna entre plomo negro y un tono marrón oscuro.
3. Pulsa **"Generar vidriera"** para procesar la imagen por primera vez. A partir de ahí,
   mover cualquier control vuelve a aplicar el efecto automáticamente (con un pequeño
   debounce para no recalcular en cada pixel de movimiento del slider).
4. Pulsa **"Descargar PNG"** para guardar el resultado.

## Notas técnicas

- El cálculo de color medio por celda usa `delaunay.find(x, y, hint)` reutilizando el
  índice de la última consulta como punto de partida, lo que lo hace muy rápido al
  recorrer la imagen en orden de barrido (scanline). Para imágenes grandes se aplica
  además un muestreo con paso (stride) adaptativo en vez de leer cada píxel individual.
- Cambiar el grosor del plomo o el brillo del vidrio **no** vuelve a llamar al worker:
  esos parámetros solo afectan al dibujado final, así que se re-renderizan al instante
  reutilizando el diagrama de Voronoi y los colores ya calculados. Cambiar el número de
  piezas o el sesgo a bordes sí dispara un nuevo cálculo en el worker, porque cambia la
  posición de los puntos semilla.

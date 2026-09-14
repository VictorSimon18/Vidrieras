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

El vidrio real se corta en piezas de pocos lados rectos (triángulos, cuadriláteros,
pentágonos, hexágonos como mucho) — nunca en la silueta exacta de lo que haya debajo (un
mechón de pelo, un pliegue de tela). El algoritmo está pensado para reproducir justo eso:
un mosaico de figuras geométricas simples, con el detalle fino de la foto (rasgos de una
cara, pliegues de ropa) recuperado como trazo pintado encima del vidrio, no como piezas
que calcan ese contorno.

1. Se cargan los píxeles de la imagen en un `ImageData` (limitando el lado más largo a
   2000 px para mantener el rendimiento).
2. **Puntos semilla**: se generan puntos distribuidos uniformemente al azar sobre el
   lienzo (su densidad depende del control "Tamaño de las piezas"), sin ningún sesgo
   hacia bordes o contornos concretos.
3. **Diagrama de Voronoi**: con esos puntos se construye un diagrama de Voronoi
   ([`d3-delaunay`](https://github.com/d3/d3-delaunay)), que por construcción son
   siempre polígonos de lados rectos.
4. **Simplificación a como mucho 6 lados**: cualquier celda con más de 6 vértices se
   simplifica (algoritmo de Visvalingam-Whyatt: se elimina repetidamente el vértice
   menos significativo) hasta dejarla en 6 o menos. Así cada pieza final es una figura
   geométrica simple, como el vidrio cortado real.
5. **Color de cada pieza**: se calcula el color medio de los píxeles originales que caen
   dentro de cada celda (con `delaunay.find(x, y, hint)`, muy rápido al recorrer la
   imagen en orden de barrido) y se convierte en un "color de vidrio" más saturado y
   vívido que el promedio fotográfico.
6. **Detalle pintado**: se calcula un mapa de bordes (Sobel) sobre la foto original y se
   pinta como un trazo oscuro fino y translúcido encima de las piezas — así reaparecen
   los ojos, la nariz, las cejas o los pliegues de la ropa como líneas finas "pintadas",
   sin necesidad de que ninguna pieza tenga esa forma.
7. Se dibuja el plomo trazando la malla exacta del Voronoi (no la simplificada, para que
   las piezas vecinas siempre encajen sin huecos), y opcionalmente se añade un
   brillo/gradiente radial suave dentro de cada pieza para dar sensación de textura de
   vidrio.

Los pasos 2, 5 y 6 (los más costosos computacionalmente) se ejecutan en un **Web
Worker**, así que la interfaz nunca se bloquea mientras se procesa una imagen. La
construcción del Voronoi, su simplificación y el dibujado ocurren en el hilo principal
porque son baratos — así, cambiar el grosor del plomo, el brillo o el detalle pintado se
redibuja al instante sin volver a tocar el worker.

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
    pointGenerator.js         Puntos semilla uniformemente aleatorios
    polygonSimplify.js        Simplifica un polígono a como mucho N vértices (Visvalingam-Whyatt)
    glassColor.js             Convierte un color medio de foto en un color de vidrio saturado
    sobel.js                  Detección de bordes sobre la foto original (detalle pintado)
    voronoiRenderer.js        Reconstruye el Voronoi y pinta el resultado (relleno, plomo, brillo, detalle)
    ui.js                     Utilidades de UI (debounce, tabs, mensajes de estado)
  worker/
    glassWorker.js            Web Worker: puntos + Voronoi + color medio por celda + bordes Sobel
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
   - **Tamaño de las piezas**: tamaño aproximado (en píxeles) de cada figura geométrica.
     Piezas más grandes = mosaico más simple; piezas más pequeñas = más detalle.
   - **Detalle pintado**: intensidad del trazo oscuro fino que se pinta sobre el vidrio
     (a la manera de la grisalla) para recuperar rasgos como ojos, cejas o pliegues sin
     necesidad de que ninguna pieza tenga esa forma.
   - **Grosor del plomo**: ancho de las líneas oscuras que separan las piezas.
   - **Brillo del vidrio**: intensidad del gradiente que simula la textura del cristal.
   - **Plomo con tono cálido**: alterna entre plomo negro y un tono marrón oscuro.
3. Pulsa **"Generar vidriera"** para procesar la imagen por primera vez. A partir de ahí,
   mover cualquier control vuelve a aplicar el efecto automáticamente (con un pequeño
   debounce para no recalcular en cada pixel de movimiento del slider).
4. Pulsa **"Descargar PNG"** para guardar el resultado.

## Notas técnicas

- La simplificación de cada celda a como mucho 6 vértices se hace de forma independiente
  por celda, así que sus lados recortados no siempre coinciden exactamente con los de la
  celda vecina. Para que eso nunca se note como un hueco, el render primero rellena la
  celda **exacta** de Voronoi (la teselación real, sin huecos posibles) y encima repinta
  la versión simplificada del mismo color: cualquier resquicio que deje la
  simplificación queda cubierto por el color correcto en vez de dejar un hueco visible.
- El plomo, en cambio, se traza sobre la malla **exacta** del Voronoi (`voronoi.render`),
  no sobre los polígonos simplificados, para que las líneas entre piezas vecinas siempre
  encajen perfectamente.
- El color medio por celda usa `delaunay.find(x, y, hint)` reutilizando el índice de la
  última consulta como punto de partida, lo que lo hace muy rápido al recorrer la imagen
  en orden de barrido (scanline). Para imágenes grandes se aplica además un muestreo con
  paso (stride) adaptativo en vez de leer cada píxel individual.
- El detalle pintado reutiliza el mapa de bordes Sobel calculado sobre la imagen
  original y lo compone como una mezcla proporcional a su intensidad de borde, sin
  ningún umbral duro ni dilatación, para que el trazo se vea suave y difuminado como una
  pincelada, no como un contorno técnico.
- Cambiar el grosor del plomo, el brillo del vidrio o el detalle pintado **no** vuelve a
  llamar al worker: esos parámetros solo afectan al dibujado final (reconstruir el
  Voronoi y redibujar es prácticamente instantáneo), así que se re-renderizan al
  instante reutilizando los puntos y colores ya calculados. Cambiar el tamaño de las
  piezas sí dispara un nuevo cálculo en el worker, porque cambia la posición de los
  puntos semilla.

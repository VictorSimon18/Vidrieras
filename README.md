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

El algoritmo no genera un mosaico aleatorio: segmenta la propia imagen en regiones de
color, así que las piezas terminan siguiendo los contornos reales del sujeto (la cara,
los ojos, la boca, la ropa...), como en una vidriera figurativa real.

1. Se cargan los píxeles de la imagen en un `ImageData` (limitando el lado más largo a
   2000 px para mantener el rendimiento).
2. **Cuantización a colores de vidrio**: se agrupan los colores de la imagen en un número
   limitado de tonos (k-means) y cada tono se satura/ajusta para que parezca un color de
   vidrio real (más vívido, menos fotográfico) en vez del color medio exacto de la foto.
3. **Segmentación en regiones**: se agrupan en componentes conexas los píxeles que
   comparten el mismo color de vidrio, así una pieza es, por ejemplo, toda la cara o
   toda la manga de una túnica.
4. **Fusión de detalles finos con su pieza**: en una vidriera real, los ojos, las cejas,
   la boca o los pliegues de la ropa no son piezas de vidrio separadas — van pintados
   (grisalla) sobre una única pieza más grande. Por eso las regiones pequeñas (ruido,
   pero también esos detalles finos) se funden con la región grande más cercana mediante
   un BFS multi-fuente, dejando piezas simples y grandes como en una vidriera figurativa
   real.
5. **Corte de piezas grandes**: las regiones grandes y planas que sobran (fondo, un
   pliegue amplio de tela) se subdividen en varias piezas — igual que una lámina de
   vidrio real se corta en varios trozos — usando un diagrama de Delaunay local
   ([`d3-delaunay`](https://github.com/d3/d3-delaunay)) por región.
6. **Detalle pintado**: se calcula un mapa de bordes (Sobel) sobre la foto original y se
   pinta como un trazo oscuro fino y translúcido encima de las piezas — así reaparecen
   los ojos, la nariz o los pliegues como líneas finas "pintadas" en vez de piezas de
   vidrio separadas, igual que en una vidriera real.
7. Se dibuja el plomo detectando los píxeles donde cambia de pieza y dilatando esa línea
   al grosor pedido, y opcionalmente se añade un brillo/gradiente radial suave dentro de
   cada pieza para dar sensación de textura de vidrio.

Los pasos 2–6 (los más costosos computacionalmente) se ejecutan en un **Web Worker**, así
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
    colorQuantize.js          Cuantización a colores de vidrio (k-means + saturación)
    regionSegmentation.js     Componentes conexas + fusión de regiones diminutas
    pieceSubdivision.js       Corte de regiones grandes en varias piezas (Delaunay local)
    sobel.js                  Detección de bordes sobre la foto original (detalle pintado)
    segmentRenderer.js        Pintado del resultado (relleno, plomo, brillo, detalle pintado)
    ui.js                     Utilidades de UI (debounce, tabs, mensajes de estado)
  worker/
    glassWorker.js            Web Worker: orquesta cuantización + segmentación + corte + bordes
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
   - **Colores de vidrio**: número de tonos a los que se reduce la imagen. Menos colores
     da piezas más grandes y simples, como en una vidriera real.
   - **Tamaño de las piezas**: también controla qué tan agresivamente se funden los
     detalles finos (ojos, boca, pliegues) con la pieza que los rodea, y el tamaño
     máximo de cada fragmento antes de cortarlo en varios. Piezas más grandes = figuras
     más simples.
   - **Detalle pintado**: intensidad del trazo oscuro fino que se pinta sobre el vidrio
     (a la manera de la grisalla) para recuperar los rasgos finos sin convertirlos en
     piezas de vidrio separadas.
   - **Grosor del plomo**: ancho de las líneas oscuras que separan las piezas.
   - **Brillo del vidrio**: intensidad del gradiente que simula la textura del cristal.
   - **Plomo con tono cálido**: alterna entre plomo negro y un tono marrón oscuro.
3. Pulsa **"Generar vidriera"** para procesar la imagen por primera vez. A partir de ahí,
   mover cualquier control vuelve a aplicar el efecto automáticamente (con un pequeño
   debounce para no recalcular en cada pixel de movimiento del slider).
4. Pulsa **"Descargar PNG"** para guardar el resultado.

## Notas técnicas

- El umbral de fusión de regiones es una **fracción del área total de la imagen** (no un
  nº de píxeles fijo), para que escale igual con cualquier resolución: así ojos, cejas,
  boca o nariz se funden con la piel circundante sea cual sea el tamaño de la foto.
- Esa fusión usa un BFS multi-fuente sembrado desde todas las regiones "grandes" a la
  vez: cada píxel de una región pequeña queda asignado a la región grande cuya "onda" lo
  alcanza primero, lo que en la práctica equivale a fundirlo con su vecina más próxima,
  en una sola pasada O(ancho×alto).
- El corte de regiones grandes en varias piezas reutiliza `delaunay.find(x, y, hint)`
  (igual que la versión anterior del proyecto) para asignar cada píxel a su fragmento
  más cercano de forma muy rápida, pero aplicado solo dentro de cada región en vez de a
  toda la imagen.
- El plomo se obtiene detectando los píxeles donde una pieza linda con otra distinta, y
  dilatando esa línea al grosor pedido mediante una dilatación separable
  (horizontal + vertical) de coste O(ancho×alto), independiente del grosor elegido.
- El detalle pintado reutiliza el mapa de bordes Sobel calculado sobre la imagen
  original (no sobre los colores de vidrio ya cuantizados) y lo compone como una mezcla
  proporcional a su intensidad de borde, sin ningún umbral duro ni dilatación, para que
  el trazo se vea suave y difuminado como una pincelada, no como un contorno técnico.
- Cambiar el grosor del plomo, el brillo del vidrio o el detalle pintado **no** vuelve a
  llamar al worker: esos parámetros solo afectan al dibujado final, así que se
  re-renderizan al instante reutilizando las piezas y colores ya calculados. Cambiar los
  colores de vidrio o el tamaño de las piezas sí dispara un nuevo cálculo en el worker,
  porque cambia la segmentación.

# Prompt inicial para Claude Code — Extensión "Bizco" 👀

> Pegá esto como primer mensaje en Claude Code, en una carpeta vacía donde ya tengas `CLAUDE.md` en la raíz. Trabajá en autonomía hasta el primer CHECKPOINT marcado.

---

Vamos a construir **Bizco**, una extensión de Chrome (Manifest V3) para una hackathon. Tengo ~3 horas. Prioridad absoluta: que funcione y sea demoable y **divertido** en vivo. Cero over-engineering. Leé `CLAUDE.md` antes de empezar y respetalo.

## El concepto en una frase
Bizco usa la cámara para estimar tu distancia a la pantalla y hace dos cosas:
1. **Ajusta el zoom del navegador** para mantener el texto siempre legible (capa seria, estable).
2. Si te pegás demasiado a la pantalla (mala postura), **el mundo se te pone "bizco"**: borroso, torcido, con colores, temblando — y se endereza solo cuando te acomodás (capa divertida, el diferenciador de la hackathon).

El nombre es la metáfora: te pegás a la pantalla → terminás bizco → Bizco te lo muestra literalmente hasta que te sentás bien.

## DOS CAPAS SEPARADAS — no las mezcles nunca
- **Capa A — Zoom (legibilidad, estable):** función FIJA distancia→zoom definida en calibración. NUNCA molesta, NUNCA tiembla. Mantiene el tamaño percibido del texto constante.
- **Capa B — Bizco mode (postura, divertida):** se dispara solo cuando detecta "demasiado cerca" sostenido. Aplica efectos visuales que escalan con la proximidad/tiempo y se revierten cuando volvés a buena postura.

La Capa A jamás debe reaccionar a "no veo bien". La Capa B jamás debe tocar el zoom. Si mezclás las dos, reaparece el loop de feedback infinito que estamos evitando.

## Capa A — Modelo de zoom (esto NO se discute, ya lo evalué)
- **No medimos distancia absoluta en cm.** Medimos el ancho del rostro en px (proxy de distancia) y trabajamos relativo a una curva de calibración.
- Cara más cerca → más grande en px. Cara más lejos → más chica en px. Más lejos debe dar más zoom.
- La curva de calibración es una **lista de puntos `[{ancho, zoom}]`**:
  - **1 punto** → tamaño angular constante (recta al origen). Es el DEFAULT y lo que usamos en la demo.
  - **N puntos** → interpolación lineal por tramos (modo avanzado opcional).
- Por qué es estable y sin loop: la curva es estática. El usuario se sienta donde quiere y siempre lee igual, así que no oscila.
- **Creá el archivo `common/zoom.js` EXACTAMENTE con este contenido (no lo modifiques, ya está validado):**

```js
// common/zoom.js
// Función pura: convierte el ancho facial actual (px) en un zoomFactor,
// usando una curva de calibración definida por el usuario.
// La "adaptatividad" vive acá: la curva es estática, por eso NO hay loop de feedback.

export const ZOOM_MIN = 0.5;
export const ZOOM_MAX = 2.5;

// Modelo:
//   - Cara más CERCA  -> ancho facial MÁS GRANDE en px
//   - Cara más LEJOS  -> ancho facial MÁS CHICO en px
//   - Queremos que más lejos => más zoom => zoom es DECRECIENTE del ancho en px.

/**
 * Normaliza los puntos: ordena de lejos a cerca y fuerza monotonía
 * no creciente en el zoom, garantizando estabilidad.
 * @param {{ancho:number, zoom:number}[]} puntos
 */
export function normalizarCurva(puntos) {
  const ordenados = [...puntos].sort((a, b) => b.ancho - a.ancho); // lejos -> cerca
  for (let i = 1; i < ordenados.length; i++) {
    if (ordenados[i].zoom > ordenados[i - 1].zoom) {
      ordenados[i].zoom = ordenados[i - 1].zoom;
    }
  }
  return ordenados;
}

/**
 * Calcula el zoomFactor para un ancho facial dado.
 * @param {number} anchoActual  Ancho facial actual en px (ya suavizado con EMA).
 * @param {{ancho:number, zoom:number}[]} curva  Puntos de calibración.
 *        1 punto  -> tamaño angular constante (recta al origen).
 *        N puntos -> interpolación lineal por tramos.
 * @returns {number} zoomFactor entre ZOOM_MIN y ZOOM_MAX.
 */
export function calcularZoom(anchoActual, curva) {
  if (!curva || curva.length === 0 || anchoActual <= 0) return 1;

  const pts = normalizarCurva(curva);

  // 1 punto: tamaño angular constante.
  if (pts.length === 1) {
    const { ancho, zoom } = pts[0];
    return clamp(zoom * (ancho / anchoActual), ZOOM_MIN, ZOOM_MAX);
  }

  // Fuera de rango: clamp al extremo.
  if (anchoActual >= pts[pts.length - 1].ancho) {
    return clamp(pts[pts.length - 1].zoom, ZOOM_MIN, ZOOM_MAX); // muy cerca
  }
  if (anchoActual <= pts[0].ancho) {
    return clamp(pts[0].zoom, ZOOM_MIN, ZOOM_MAX); // muy lejos
  }

  // Interpolación lineal por tramos.
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const lo = Math.min(a.ancho, b.ancho);
    const hi = Math.max(a.ancho, b.ancho);
    if (anchoActual >= lo && anchoActual <= hi) {
      const t = (anchoActual - a.ancho) / (b.ancho - a.ancho);
      return clamp(a.zoom + t * (b.zoom - a.zoom), ZOOM_MIN, ZOOM_MAX);
    }
  }
  return 1; // fallback defensivo
}

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}
```

## Capa B — Bizco mode (la parte divertida, el diferenciador)
Detección: si el ancho facial supera el umbral "demasiado cerca" de forma **sostenida** (no instantánea), arranca una escalada de efectos. En cuanto vuelve a buena postura, se revierte suave.

Niveles (graduales y reversibles, calculados desde "qué tan cerca" + "cuánto tiempo"):
- **Nivel 0 — postura ok:** nada.
- **Nivel 1 — aviso sutil:** un ícono de ojos bizcos 👀 aparece en una esquina, o el borde de la página pulsa suave.
- **Nivel 2 — el mundo empieza a torcerse:** `filter: blur()` leve y creciente + un `skew`/`rotate` mínimo (el mundo "bizco"). Crece con la proximidad.
- **Nivel 3 — caos total:** `hue-rotate` animado (colores psicodélicos), shake del body (animación de translate), blur fuerte, doble visión (un pseudo-elemento o text-shadow desplazado que simula ver bizco). Opcional si sobra tiempo: letras individuales temblando/volando.
- **Recuperación:** transición CSS suave de vuelta a normal cuando te alejás. Que se sienta como "se acomodó la vista".

Implementación (orden de costo, hacé primero lo barato):
1. Efectos a **nivel de página entera** vía un content script que inyecta/ajusta una clase + variables CSS en `<html>` (`filter`, `transform`, animaciones). Esto es 1-2 líneas de CSS por efecto y se ve dramático. ESTO ES LO PRINCIPAL.
2. Solo si sobra tiempo: efectos por palabra (envolver nodos de texto en spans). Caro y frágil — déjalo para el final o como roadmap.

El efecto estrella debe ser la **"visión bizca"**: la página se desenfoca y se duplica/tuerce ligeramente, como ver con los ojos cruzados. Es el gag visual que justifica el nombre.

## Stack y decisiones cerradas
- Manifest V3, vanilla JS (sin React).
- Visión: `@mediapipe/tasks-vision` → `FaceLandmarker` (WASM, on-device), en un **offscreen document** (NUNCA en content scripts).
- Zoom: `chrome.tabs.setZoom(tabId, zoomFactor)` (zoom nativo). NUNCA CSS font-size.
- Efectos Bizco: content script que manipula CSS de la página activa.
- Cámara: ver "Permiso de cámara" abajo. El video se captura con `getUserMedia` en el offscreen document, PERO el permiso NO se pide ahí.
- Estado/config: `chrome.storage.local`.
- **Privacy-first absoluto:** los frames NUNCA se guardan, NUNCA salen del dispositivo, NUNCA van a la red. Es un punto del pitch: escribilo en el manifest `description` y en el popup.

## ⚠️ Trampa de MediaPipe en MV3 — resolvé esto en la Fase 0
La CSP de MV3 prohíbe scripts/WASM remotos. Empaquetá los assets localmente:
1. `npm i @mediapipe/tasks-vision`
2. Copiá los `.wasm` de `node_modules/@mediapipe/tasks-vision/wasm/` a `vendor/mediapipe/wasm/`.
3. Descargá `face_landmarker.task` a `vendor/mediapipe/models/`.
4. Cargá con rutas locales:
   ```js
   const fileset = await FilesetResolver.forVisionTasks(chrome.runtime.getURL("vendor/mediapipe/wasm"));
   const faceLandmarker = await FaceLandmarker.createFromOptions(fileset, {
     baseOptions: { modelAssetPath: chrome.runtime.getURL("vendor/mediapipe/models/face_landmarker.task") },
     runningMode: "VIDEO",
     numFaces: 1
   });
   ```
5. Declará `vendor/**` en `web_accessible_resources`.
**Fallback si te come tiempo:** `FaceDetector` (Shape Detection API) detrás de un flag. El camino principal es MediaPipe.

## ⚠️ Permiso de cámara en MV3 — otra trampa, leé esto bien
- La cámara NO es un permiso del manifest. NO declares `"camera"` en `permissions`. Es `getUserMedia`, un permiso de runtime que el navegador concede al ORIGEN de la extensión (`chrome-extension://<id>`), una sola vez y persistente.
- **Un offscreen document NO puede mostrar el prompt de permiso** (no tiene UI). Si pedís `getUserMedia` ahí sin permiso previo, falla en silencio. NO bootstrapees el permiso desde el offscreen.
- **Flujo correcto en dos tiempos:**
  1. **Bootstrap (una vez):** desde una página VISIBLE de la extensión —la página de opciones/onboarding (un tab completo, abierto en el primer uso o al activar Bizco)— llamás a `getUserMedia({ video: true })`. Ahí aparece el prompt, el usuario concede, el permiso queda guardado para el origen.
  2. **Captura continua:** recién después, el offscreen document usa `getUserMedia` en silencio (mismo origen → ya tiene permiso).
- El POPUP es mal lugar para pedir el permiso: se cierra al hacer clic afuera y corta el flujo. El popup es solo toggle + stats. La primera concesión va en options/onboarding.
- Manejá el caso "permiso denegado": mostrar mensaje claro en el popup + caer al **modo demo** (slider que simula la distancia) para que la extensión siga siendo demoable.

## Popup = botonera de control (activar/desactivar)
El popup que se abre al clickear el ícono es el panel de control principal. Contiene:
- **Botón Activar / Desactivar Bizco** (el control central, on/off de toda la extensión).
- **Botón Calibrar**.
- Indicadores en vivo: distancia relativa, zoom actual, nivel Bizco.
- Estado de la cámara (activa / sin permiso / denegada).

Comportamiento del botón Activar/Desactivar:
- **Activar, primera vez (sin permiso de cámara aún):** abre el tab de onboarding/options donde se pide el permiso con `getUserMedia` (el popup no puede hostear el prompt). Concedido el permiso → arranca el monitoreo (crea el offscreen document, empieza a leer la cámara).
- **Activar, con permiso ya concedido:** arranca directo (crea offscreen + empieza a monitorear), sin abrir nada.
- **Desactivar:** frena el monitoreo, cierra el offscreen document, **apaga el stream de la cámara de verdad** (que se apague la lucecita — punto de confianza/privacidad para el pitch), quita los efectos Bizco de la página y restaura el zoom a 1.
- El estado activo/inactivo se guarda en `chrome.storage` y se refleja en el botón al reabrir el popup.

## Estructura de archivos
```
manifest.json
service_worker.js        // orquestador: estado, zoom, nivel Bizco, mensajería
offscreen.html / .js     // cámara + MediaPipe + ancho facial + EMA
popup.html / .js         // BOTONERA: botón Activar/Desactivar Bizco + Calibrar + distancia/zoom/nivel en vivo
options.html / .js       // wizard de onboarding (config inicial) + settings re-editables + modo avanzado
content.js               // aplica efectos Bizco a la página + el ícono 👀
common/zoom.js           // crealo con el código exacto de arriba: calcularZoom() + normalizarCurva()
common/effects.js        // nivelBizco(ancho, umbral, tiempo) -> 0..3 (pura, testeable)
common/messages.js
common/storage.js
styles/bizco.css         // clases y keyframes de los efectos (blur, shake, hue, skew)
vendor/mediapipe/...
icons/...                // logo: ojos bizcos que se enderezan
```

## Flujo de mensajería
- `service_worker` crea el offscreen document al activarse (`chrome.offscreen.createDocument`).
- `offscreen.js`: loop de cámara a **~12 fps**, estima `ancho_px`, aplica **EMA** (alpha ~0.2), manda `{type: FACE, ancho}` al SW con throttle ~250ms.
- `service_worker`: calcula `zoomFactor` con `common/zoom.js` → `chrome.tabs.setZoom` (con histéresis); calcula nivel Bizco con `common/effects.js` → manda `{type: BIZCO_LEVEL, nivel}` al content script de la pestaña activa.
- `content.js`: aplica/quita clases CSS y variables según el nivel.
- `popup.js`: muestra distancia, zoom y nivel Bizco en vivo.

## Estabilidad de la Capa A (crítico, demo en vivo)
1. EMA sobre el ancho facial. 2. Histéresis: solo `setZoom` si el factor cambia >3%. 3. Throttle: máx ~4 `setZoom`/seg. 4. Clamp `[0.5, 2.5]`. 5. Cara no detectada → mantener último zoom, no resetear. 6. Varias caras → la más grande/central.

## Onboarding al instalar (configuración inicial de TODOS los parámetros)
Al descargar/instalar la extensión, en `service_worker` escuchá `chrome.runtime.onInstalled` y, si `reason === 'install'`, abrí automáticamente un **tab de onboarding** (`onboarding.html`, puede ser la misma `options.html` en modo wizard). Es un asistente paso a paso que configura todo de una y guarda en `chrome.storage`:

1. **Bienvenida + permiso de cámara:** explica qué hace Bizco (1 frase + "100% on-device") y pide el permiso con `getUserMedia` (acá es donde se bootstrapea el permiso, ver sección de cámara).
2. **Tamaño de texto preferido:** slider con un **bloque de texto de ejemplo en vivo** que se reescala mientras lo movés, para que el usuario lo deje a su gusto (mostrar ejemplos, como pediste).
3. **Calibración de distancia (poses):** capturar al menos 1 pose ("sentate cómodo" → captura `ancho` + zoom deseado). Opcional: 3 poses para la curva multi-punto.
4. **Comportamiento Bizco:** sensibilidad (qué tan cerca / cuánto tiempo antes de los efectos) + intensidad del caos (de "sutil" a "fiesta psicodélica"), con un botón "probar efecto" para previsualizar.
5. **Listo:** guarda todo, marca `onboardingCompleto = true`, activa Bizco.

Reglas:
- El onboarding debe ser **saltable** (botón "configurar después" con defaults sensatos) para no trabar la demo.
- Re-ejecutable: un botón "Volver a configurar" en options/popup que reabre el wizard.
- Todos los parámetros viven en `chrome.storage.local` con defaults definidos, así la extensión funciona aunque el usuario salte pasos.

## Calibración (UX por POSES, no por cm)
No sabemos cm, así que pedimos poses naturales:
- Flujo MVP (demo): el usuario se sienta cómodo → toca **"Calibrar"** en el popup → cuenta de 3s → captura `ancho` promedio de ~1s y guarda el zoom deseado → curva de 1 punto. Listo.
- Modo avanzado (opcional, en options): capturar 3 poses — "reclinado", "normal", "concentrado/cerca" — para armar la curva de 3 puntos. Cada pose captura `ancho` y el usuario ajusta el zoom ahí.

## Página de opciones
Sliders en `chrome.storage`:
- **Tamaño de texto preferido** con un bloque de texto de ejemplo en vivo que se reescala con el slider.
- **Sensibilidad Bizco** (qué tan cerca / cuánto tiempo antes de que arranquen los efectos).
- **Intensidad del caos** (cuán agresivos los efectos: de "sutil" a "fiesta psicodélica").
- **Umbral de zoom mín/máx**.
- **Modo avanzado**: calibración multi-punto.

## manifest.json — campos necesarios
- `manifest_version: 3`
- `permissions`: `["tabs", "storage", "offscreen", "activeTab", "scripting"]`
- `host_permissions`: `["<all_urls>"]`
- `background.service_worker`, `action.default_popup`, `options_page`
- En `service_worker`: `chrome.runtime.onInstalled` → si `reason === 'install'`, abrir el tab de onboarding (`chrome.tabs.create`).
- `content_scripts` (para `content.js` + `styles/bizco.css`)
- `web_accessible_resources` para `vendor/**`
- `description`: gancho corto + "100% on-device, la cámara nunca sale de tu equipo".

## Plan por fases (respetá el orden y los CHECKPOINTS)
- **Fase 0 — Esqueleto + cámara (25 min):** manifest + service_worker + popup con toggle + página de onboarding/options que pide el permiso de cámara con `getUserMedia` (esto es el bootstrap, NO desde el offscreen) + offscreen que, una vez concedido el permiso, abre la cámara y loguea que MediaPipe detecta una cara. **CHECKPOINT 0: pará y confirmame que el prompt de cámara aparece, se concede, y MediaPipe detecta una cara desde el offscreen.**
- **Fase 1 — Distancia (25 min):** estimar `ancho_px` + EMA, log en consola. Verificar que sube al acercarse.
- **Fase 2 — Zoom (30 min):** conectar `common/zoom.js` → SW → `setZoom` con estabilidad. Probar en una página real. **CHECKPOINT 1: el zoom ajusta suave, sin temblar.**
- **Fase 3 — Bizco mode (40 min):** `common/effects.js` (niveles) + `content.js` + `styles/bizco.css` con blur/skew/hue/shake/"visión bizca". Probar pegándote a la cámara → la página enloquece → te alejás → se acomoda. **CHECKPOINT 2: esto es el wow de la demo, que se vea bien.**
- **Fase 4 — Calibración + popup en vivo (25 min):** botón calibrar (1 punto) + indicadores de distancia/zoom/nivel en el popup.
- **Fase 5 — Onboarding + opciones + pulido demo (20 min):** wizard de onboarding al instalar (`onInstalled` → tab con los pasos: cámara → tamaño con ejemplos → calibración → comportamiento Bizco → guardar), saltable y re-ejecutable; settings re-editables; ícono de ojos bizcos; copy del pitch; estado de cámara denegada → modo manual; y un **"modo demo"**: un slider que simula la distancia, por si la cámara falla frente al jurado.

## Reglas de trabajo
- Vanilla JS, legible, comentarios cortos en español.
- Tengo poco background en JS: explicá decisiones no obvias en 1-2 líneas.
- Parar en cada CHECKPOINT y esperar mi OK.
- Si algo va a tomar >15 min (típico: MediaPipe en MV3), avisá y proponé fallback antes de meterte.
- Probamos con "Cargar descomprimida" en chrome://extensions. Que funcione sin build, o con un `npm run build` de un solo comando.
- La diversión (Capa B) es prioridad de demo: NO sacrifiques la Fase 3 por pulir opciones.

Empezá por la Fase 0.

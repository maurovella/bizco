# CLAUDE.md — Bizco 👀

Contexto persistente del proyecto. Leé esto antes de cualquier tarea.

## Qué es
**Bizco** es una extensión de Chrome (Manifest V3) de hackathon. Usa la cámara (on-device) para estimar la distancia del usuario a la pantalla y hace dos cosas, en DOS CAPAS SEPARADAS:
- **Capa A (zoom, seria/estable):** ajusta `chrome.tabs.setZoom()` con una curva fija de calibración para mantener el texto siempre legible.
- **Capa B (Bizco mode, divertida):** si el usuario se pega demasiado a la pantalla, le pone "el mundo bizco" (blur, torcido, colores, temblando) hasta que se acomoda. Es el diferenciador divertido de la hackathon y la razón del nombre.

Prioridad: funcionar + ser demoable y divertido en vivo. No perfección.

## Regla de oro — las dos capas NO se mezclan
- Capa A nunca reacciona a "no veo bien" y nunca molesta. Es una función FIJA distancia→zoom.
- Capa B nunca toca el zoom. Solo aplica efectos visuales.
- Mezclarlas reintroduce el loop de feedback infinito (acercarse→agrandar→alejarse→achicar→...). PROHIBIDO.

## Capa A — modelo de zoom
- No medimos cm. Medimos ancho facial en px (proxy de distancia), relativo a una curva de calibración.
- Cara más cerca → más px. Más lejos → menos px → más zoom.
- Curva = lista de puntos `[{ancho, zoom}]`. 1 punto = tamaño angular constante (default, demo). N puntos = interpolación lineal por tramos (avanzado).
- La función pura ya existe en `common/zoom.js` (`calcularZoom`, `normalizarCurva`, clamp [0.5, 2.5], monotonía forzada). USARLA, no reescribirla.

## Capa B — Bizco mode
- Se dispara cuando el ancho facial supera el umbral "demasiado cerca" de forma SOSTENIDA.
- Niveles graduales y reversibles (0 nada → 1 aviso 👀 → 2 blur+skew → 3 caos psicodélico + "visión bizca").
- Efectos a nivel de página entera primero (clase CSS + variables en `<html>`: filter, transform, keyframes). Barato y dramático. Por-palabra solo si sobra tiempo.
- Efecto estrella: "visión bizca" (desenfoque + duplicado/torcido), que justifica el nombre.
- Lógica de nivel: función pura en `common/effects.js`.

## Estabilidad Capa A (demo en vivo)
EMA (alpha ~0.2) → histéresis (ignorar cambios <3%) → throttle (máx ~4 setZoom/seg) → clamp [0.5, 2.5]. Cara no detectada = mantener último zoom. Loop de cámara ~12 fps.

## Decisiones cerradas
- MV3, vanilla JS (sin React).
- Visión: `@mediapipe/tasks-vision` → `FaceLandmarker`, WASM **empaquetado localmente** (CSP de MV3 prohíbe remotos). Assets en `vendor/mediapipe/`, en `web_accessible_resources`.
- Cámara + MediaPipe en un **offscreen document**, nunca en content scripts.
- **Permiso de cámara:** NO es permiso de manifest (es `getUserMedia`, runtime, por origen). El offscreen NO puede mostrar el prompt → el permiso se pide UNA vez desde una página visible (options/onboarding), y recién después el offscreen captura en silencio. El popup no sirve para esto (se cierra). Permiso denegado → modo demo.
- Zoom: `chrome.tabs.setZoom()`. Nunca CSS font-size.
- Efectos Bizco: `content.js` manipulando CSS de la página.
- **Popup = botonera:** botón Activar/Desactivar (on/off de toda la extensión) + Calibrar + stats en vivo. Activar la primera vez (sin permiso) abre el onboarding para conceder cámara; con permiso, arranca directo. Desactivar apaga el stream de verdad, quita efectos y restaura zoom a 1.
- Estado: `chrome.storage.local`.
- Privacy-first: frames nunca guardados, nunca a la red, todo on-device. Decirlo en manifest y popup.
- **Onboarding al instalar:** `chrome.runtime.onInstalled` (reason 'install') → abre tab wizard que configura los parámetros iniciales (cámara → tamaño de texto con ejemplos en vivo → calibración por poses → sensibilidad/intensidad Bizco → guardar). Saltable, re-ejecutable, con defaults sensatos en `chrome.storage`.

## Estructura de archivos
```
manifest.json
service_worker.js     # orquestador: estado, zoom, nivel Bizco, mensajería
offscreen.html / .js  # cámara + MediaPipe + ancho facial + EMA
popup.html / .js      # toggle, calibrar, distancia/zoom/nivel en vivo
options.html / .js    # sliders + preview + modo avanzado multi-punto
content.js            # efectos Bizco + ícono 👀
common/zoom.js        # YA EXISTE — no reescribir
common/effects.js     # nivelBizco() pura
common/messages.js / storage.js
styles/bizco.css      # clases y keyframes de efectos
vendor/mediapipe/...
icons/...             # ojos bizcos que se enderezan
```

## Fuera de alcance HOY (roadmap)
- Cualquier uso de edad (no se pide ni se infiere por ahora; quedó fuera del alcance).
- Distancia absoluta en cm (no hace falta; todo relativo).
- Eye-tracking de palabras/oraciones, estadísticas de ergonomía, multi-perfil.
- Efectos Bizco por-palabra (caro; solo si sobra tiempo en Fase 3).

## Estilo de trabajo con Franco
- Background limitado en JS: explicar decisiones no obvias en 1-2 líneas, en español.
- Parar en cada CHECKPOINT y esperar OK.
- Si una tarea va a tomar >15 min (típico: MediaPipe en MV3), avisar y proponer fallback antes.
- La diversión (Capa B / Fase 3) es prioridad de demo: no sacrificarla por pulir opciones.
- Probar con "Cargar descomprimida". Si hay build, un solo comando.

## Cómo probar
1. `chrome://extensions` → modo desarrollador → "Cargar descomprimida".
2. Abrir cualquier página → popup → "Calibrar" → mover la cabeza: el zoom ajusta suave; al pegarse mucho, arranca el Bizco mode.
3. Consola del offscreen: chrome://extensions → "Inspeccionar vistas: offscreen".
4. "Modo demo" (slider que simula distancia) por si la cámara falla en el escenario.

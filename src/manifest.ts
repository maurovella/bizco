import { defineManifest } from '@crxjs/vite-plugin'
import pkg from '../package.json'

export default defineManifest({
  manifest_version: 3,
  name: 'Bizco',
  version: pkg.version,
  description: pkg.description,

  icons: {
    16: 'icons/icon16.png',
    48: 'icons/icon48.png',
    128: 'icons/icon128.png',
  },

  action: {
    default_popup: 'src/popup/index.html',
    default_title: 'Bizco',
  },

  // Wizard de onboarding + settings re-editables.
  options_page: 'src/options/index.html',

  background: {
    service_worker: 'src/background/index.ts',
    type: 'module',
  },

  // MV3 prohíbe compilar WASM por defecto (script-src 'self'). MediaPipe lo
  // necesita: habilitamos 'wasm-unsafe-eval' en las páginas de la extensión.
  content_security_policy: {
    extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'",
  },

  content_scripts: [
    {
      js: ['src/content/index.ts'],
      // styles/bizco.css define las clases/keyframes de los efectos Bizco.
      css: ['src/styles/bizco.css'],
      matches: ['<all_urls>'],
      run_at: 'document_idle',
    },
  ],

  // "offscreen": documento oculto con el stream de cámara (los SW de MV3 no
  // pueden acceder a la cámara). "tabs"/"activeTab"/"scripting": para
  // chrome.tabs.setZoom y mensajear al content script de la pestaña activa.
  permissions: ['storage', 'offscreen', 'tabs', 'activeTab', 'scripting'],

  // setZoom y los efectos Bizco corren en cualquier página.
  host_permissions: ['<all_urls>'],

  web_accessible_resources: [
    {
      // vendor/mediapipe/**: WASM + modelo de FaceLandmarker, cargados en
      // local (la CSP de MV3 prohíbe assets remotos).
      resources: ['src/offscreen/offscreen.html', 'vendor/mediapipe/*'],
      matches: ['<all_urls>'],
    },
  ],
})

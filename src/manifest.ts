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

  background: {
    service_worker: 'src/background/index.ts',
    type: 'module',
  },

  content_scripts: [
    {
      js: ['src/content/index.ts'],
      matches: ['<all_urls>'],
      run_at: 'document_idle',
    },
  ],

  // "offscreen" lets the service worker spin up a hidden document that can
  // hold a long-lived getUserMedia camera stream (MV3 service workers cannot
  // access the camera directly).
  permissions: ['storage', 'offscreen'],

  // Needed so the offscreen document can POST captured frames to the backend.
  // Adjust to your production backend host before publishing.
  host_permissions: [
    'http://localhost:*/*',
    'https://localhost:*/*',
  ],

  web_accessible_resources: [
    {
      resources: ['src/offscreen/offscreen.html'],
      matches: ['<all_urls>'],
    },
  ],
})

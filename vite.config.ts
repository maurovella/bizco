import { defineConfig } from 'vite'
import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { crx } from '@crxjs/vite-plugin'
import manifest from './src/manifest'

// https://vitejs.dev/config/
export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  plugins: [
    react(),
    crx({ manifest }),
  ],
  build: {
    rollupOptions: {
      // The offscreen document is not referenced from the manifest, so we
      // register its HTML entry point explicitly for CRXJS/Vite to build it.
      input: {
        offscreen: resolve(__dirname, 'src/offscreen/offscreen.html'),
        permission: resolve(__dirname, 'src/permission/index.html'),
      },
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    hmr: {
      port: 5173,
    },
  },
})

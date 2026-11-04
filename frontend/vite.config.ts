import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  build: {
    // Licenses of every bundled npm package, served as /.vite/license.md (MIT/Apache notices for the bundle).
    license: true,
    rollupOptions: {
      output: {
        // Split rarely-changing vendor libs into their own chunk so app deploys
        // don't invalidate them in the browser cache. Build-only, no runtime change.
        manualChunks(id) {
          if (/node_modules\/(react|react-dom|react-router|react-router-dom|scheduler)\//.test(id))
            return 'vendor-react';
          if (/node_modules\/@tanstack\//.test(id)) return 'vendor-query';
        },
      },
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // We register + auto-reload manually in main.tsx, so don't inject registerSW.js too.
      injectRegister: null,
      manifest: {
        name: 'Foliant — Charakterverwaltung',
        short_name: 'Foliant',
        theme_color: '#24130a',
        background_color: '#1c120b',
        display: 'standalone',
        icons: [
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
        ],
      },
      workbox: {
        // Push + notification-click handlers live in public/push-sw.js.
        importScripts: ['push-sw.js'],
        // Raise the per-file limit to cover the DiceBox WebWorker bundle (~3 MB).
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        // Exclude dice-box worker/wasm files from precache (loaded on demand anyway).
        globIgnores: ['**/assets/dice-box/**', '**/world.*.js', '**/Dice.*.js'],
        // App shell + assets cached for offline. API GETs cached network-first (stale fallback offline).
        runtimeCaching: [
          {
            urlPattern: ({ url }) => /\/(characters|messages|gm)/.test(url.pathname),
            handler: 'NetworkFirst',
            options: { cacheName: 'api', networkTimeoutSeconds: 5 },
          },
        ],
      },
    }),
  ],
})

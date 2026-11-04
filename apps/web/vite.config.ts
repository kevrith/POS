import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['favicon.png', 'logo.png', 'icons/*.png'],
      manifest: {
        name: 'KASTRA POS',
        short_name: 'KASTRA POS',
        description: 'Modern Point of Sale system for Kenyan businesses',
        theme_color: '#2563eb',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'any',
        start_url: '/',
        scope: '/',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        categories: ['business', 'finance', 'productivity'],
      },
      workbox: {
        skipWaiting: true,
        clientsClaim: true,
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        navigateFallback: '/index.html',
        // Links we hand to customers and suppliers must always fetch a fresh shell.
        // navigateFallback answers every navigation from the precache, so a device
        // that has the app cached can open /track/... on a months-old bundle — which
        // is how a public page ends up showing the staff login instead. First-time
        // visitors have no service worker and were never affected; the operator's
        // own browser was.
        navigateFallbackDenylist: [
          /^\/api\//,
          /^\/offline\.html$/,
          /^\/track\//,
          /^\/quote\//,
          /^\/shop\//,
          /^\/pay\//,
          /^\/menu\//,
          /^\/order\//,
          /^\/portal/,
          /^\/affiliate/,
        ],
        runtimeCaching: [
          {
            urlPattern: /^\/api\/v1\/(items|customers)/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-data-cache',
              expiration: { maxEntries: 50, maxAgeSeconds: 3600 },
              networkTimeoutSeconds: 5,
            },
          },
          {
            urlPattern: /^\/api\/v1\/(sales|loyalty|etims|payments|gift-cards|notifications)/,
            handler: 'NetworkOnly',
          },
          {
            urlPattern: /^\/api\//,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              expiration: { maxEntries: 200, maxAgeSeconds: 3600 },
              networkTimeoutSeconds: 10,
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // Resolve the shared package locally — no workspace install needed
      '@pos/shared': path.resolve(__dirname, '../../packages/shared/index.ts'),
      '@pos/print-core': path.resolve(__dirname, '../../packages/print-core/src/index.ts'),
    },
  },
  server: {
    port: 3005,
    proxy: {
      '/api': {
        target: 'http://localhost:3010',
        changeOrigin: true,
      },
    },
    // Use polling to avoid ENOSPC inotify watcher limit on Linux
    watch: {
      usePolling: true,
      interval: 500,
    },
  },
});

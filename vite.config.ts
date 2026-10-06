import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

const base = process.env.GITHUB_ACTIONS === 'true' ? '/myride-journal/' : '/'

// https://vite.dev/config/
export default defineConfig({
  base,
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'pwa-icon-180.png', 'pwa-icon-192.png', 'pwa-icon-512.png'],
      manifest: {
        name: 'MyRide',
        short_name: 'MyRide',
        description: 'Personal motorcycle trip journal and riding dossier.',
        theme_color: '#12342E',
        background_color: '#F4F6F4',
        display: 'standalone',
        start_url: base,
        scope: base,
        icons: [
          { src: `${base}pwa-icon-192.png`, sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: `${base}pwa-icon-512.png`, sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      workbox: {
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/.*\.tile\.openstreetmap\.org\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'osm-tiles',
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
        ],
      },
    }),
  ],
})

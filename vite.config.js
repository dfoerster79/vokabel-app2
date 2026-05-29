import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'VokabelApp',
        short_name: 'Vokabeln',
        start_url: '/',
        display: 'standalone',
        background_color: '#f7f6f2',
        theme_color: '#01696f',
        orientation: 'portrait',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ],
        shortcuts: [
          { name: 'Neuer Test', url: '/vokabeln/neu', icons: [{ src: '/icons/shortcut-new.png', sizes: '96x96' }] },
          { name: 'Lernen', url: '/lernen', icons: [{ src: '/icons/shortcut-learn.png', sizes: '96x96' }] }
        ]
      },
      workbox: {
        runtimeCaching: [
          {
            urlPattern: /^\/api\//,
            handler: 'NetworkFirst',
            options: { cacheName: 'api-cache' }
          }
        ]
      }
    })
  ]
})

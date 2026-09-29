import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Fail loudly instead of silently moving to 5174 — the API's CORS list
    // names 5173, so a silent port change would look like a backend outage.
    strictPort: true,
  },
  build: {
    target: 'es2020',
    // Leaflet is the only large dependency and it never changes between
    // builds. Splitting it out means editing a component does not invalidate
    // the map chunk in the browser cache.
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes('node_modules/leaflet')) return 'leaflet'
          if (id.includes('node_modules/react')) return 'react'
          return undefined
        },
      },
    },
  },
})

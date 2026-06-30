import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Proxies /api requests to the local backend during development so the
// frontend can call relative paths like /api/intake/start without CORS
// headaches. In production (Render/Railway) the frontend will call the
// deployed backend URL directly via an environment variable instead.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true
      }
    }
  }
})

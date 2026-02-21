import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Proxy requests to /api/gateway/* → OpenClaw gateway at localhost:18789
      // The bearer token stays server-side (never sent to browser)
      '/api/gateway': {
        target: 'http://localhost:18789',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/gateway/, '/api'),
        headers: {
          'Authorization': `Bearer ${process.env.OPENCLAW_GATEWAY_TOKEN || 'REDACTED_GATEWAY_TOKEN'}`
        }
      }
    }
  }
})

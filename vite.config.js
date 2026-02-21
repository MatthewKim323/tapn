import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Health-check ping — just hits the gateway root to see if it's alive
      '/api/gateway-health': {
        target: 'http://127.0.0.1:18789',
        changeOrigin: true,
        rewrite: () => '/',
      },
      // WebSocket proxy for the OpenClaw gateway (used by pipeline init)
      '/ws/gateway': {
        target: 'ws://127.0.0.1:18789',
        ws: true,
        changeOrigin: true,
        rewrite: () => '/',
      },
    }
  }
})

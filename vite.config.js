import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// Custom plugin: serves /api/interview/signed-url during dev
// so the ElevenLabs API key never touches the client bundle.
function elevenLabsSignedUrlPlugin() {
  let apiKey = ''
  let agentId = ''
  return {
    name: 'elevenlabs-signed-url',
    configResolved(config) {
      // loadEnv with '' prefix loads ALL env vars (not just VITE_)
      const env = loadEnv('', config.root, '')
      apiKey = env.ELEVENLABS_API_KEY || env.VITE_ELEVENLABS_API_KEY || ''
      agentId = env.VITE_ELEVENLABS_AGENT_ID || ''
    },
    configureServer(server) {
      server.middlewares.use('/api/interview/signed-url', async (_req, res) => {
        if (!apiKey || !agentId) {
          res.writeHead(500, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'ELEVENLABS_API_KEY or VITE_ELEVENLABS_AGENT_ID not set' }))
          return
        }
        try {
          const resp = await fetch(
            `https://api.elevenlabs.io/v1/convai/conversation/get_signed_url?agent_id=${agentId}`,
            { headers: { 'xi-api-key': apiKey } }
          )
          if (!resp.ok) {
            const text = await resp.text()
            res.writeHead(resp.status, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: text }))
            return
          }
          const data = await resp.json()
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ signedUrl: data.signed_url }))
        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: err.message }))
        }
      })

      // List all past conversations
      server.middlewares.use('/api/interview/conversations', async (req, res, next) => {
        // only handle exact path (not sub-paths like /conversations/conv_xxx)
        const url = new URL(req.url, 'http://localhost')
        if (url.pathname !== '/' && url.pathname !== '') return next()
        if (!apiKey || !agentId) {
          res.writeHead(500, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'keys not configured' }))
          return
        }
        try {
          const resp = await fetch(
            `https://api.elevenlabs.io/v1/convai/conversations?agent_id=${agentId}`,
            { headers: { 'xi-api-key': apiKey } }
          )
          const data = await resp.json()
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify(data))
        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: err.message }))
        }
      })

      // Fetch a specific conversation's full transcript
      server.middlewares.use('/api/interview/conversation/', async (req, res) => {
        if (!apiKey) {
          res.writeHead(500, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'keys not configured' }))
          return
        }
        // extract conversation_id from the URL (e.g. /api/interview/conversation/conv_xxx)
        const convId = req.url.replace(/^\//, '').split('?')[0]
        if (!convId) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'missing conversation_id' }))
          return
        }
        try {
          const resp = await fetch(
            `https://api.elevenlabs.io/v1/convai/conversations/${convId}`,
            { headers: { 'xi-api-key': apiKey } }
          )
          const data = await resp.json()
          res.writeHead(resp.ok ? 200 : resp.status, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify(data))
        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: err.message }))
        }
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), elevenLabsSignedUrlPlugin()],
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

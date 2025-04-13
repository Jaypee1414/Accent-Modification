import Fastify from 'fastify'
import { WebSocketServer } from 'ws'
import { handleWebSocketConnection } from './signaling.js'

const fastify = Fastify()
const wss = new WebSocketServer({ noServer: true })

// Attach connection handler
wss.on('connection', handleWebSocketConnection)

// Upgrade HTTP to WebSocket manually (needed for ws + Fastify)
fastify.server.on('upgrade', (req, socket, head) => {
  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit('connection', ws, req)
  })
})

fastify.listen({ port: 3001 }, (err, address) => {
  if (err) {
    console.error('❌ Server error:', err)
    process.exit(1)
  }
  console.log(`🚀 Fastify + WebRTC signaling server running at ${address}`)
})

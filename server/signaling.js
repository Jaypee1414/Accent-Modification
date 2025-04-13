import wrtc from 'wrtc'

export function handleWebSocketConnection(ws) {
  console.log('✅ WebSocket client connected (for signaling)')

  let peer = null

  ws.on('message', async (message) => {
    let data = null
    try {
      data = JSON.parse(message)
    } catch (err) {
      console.error('❌ Invalid JSON:', err)
      return
    }

    // Handle SDP offer
    if (data.type === 'offer') {
      peer = new wrtc.RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
      })

      // Return ICE candidates back to client
      peer.onicecandidate = (event) => {
        if (event.candidate) {
          ws.send(JSON.stringify({ type: 'candidate', candidate: event.candidate }))
        }
      }

      // Detect WebRTC connection state changes
      peer.onconnectionstatechange = () => {
        console.log('🔌 WebRTC state:', peer.connectionState)
        if (['disconnected', 'failed', 'closed'].includes(peer.connectionState)) {
          peer.close()
        }
      }

      // note  Detect audio track and when user starts talking
      peer.ontrack = (event) => {
        console.log('🎧 ontrack event fired')
        const [incomingStream] = event.streams
        if (incomingStream) {
          incomingStream.getTracks().forEach((track) => {
            console.log(`🎤 Received ${track.kind} track`)

            if (track.kind === 'audio') {
              console.log('🎤 Audio track detected')
              console.log(`🎤 Received ${track.label} track`)
              console.log("🔍 Kind:", track.kind);
              console.log("🔍 Enabled:", track.enabled);
              console.log("🔍 Muted:", event.streams[0])
              console.log("🔍 Ready state:", track.readyState);
              
              track.onunmute = () => {
                console.log('🟢 Listening: user is speaking')
              }

              // Optionally: Detect when audio stops
              track.onmute = () => {
                console.log('🔴 Mic is muted or no audio')
              }
            }
          })
        }
      }

      // Set remote description from client
      await peer.setRemoteDescription(new wrtc.RTCSessionDescription(data.offer))
      const answer = await peer.createAnswer()
      await peer.setLocalDescription(answer)

      ws.send(JSON.stringify({ type: 'answer', answer }))
    }

    // Handle incoming ICE candidates
    if (data.candidate && peer) {
      try {
        const candidate = new wrtc.RTCIceCandidate(data.candidate)
        await peer.addIceCandidate(candidate)
        console.log('📥 Added ICE candidate')
      } catch (err) {
        console.error('❌ Failed to add ICE candidate:', err)
      }
    }
  })

  ws.on('close', () => {
    console.log('❌ WebSocket disconnected')
    if (peer) peer.close()
  })
}

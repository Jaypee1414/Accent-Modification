import wrtc from "wrtc"

export function handleWebSocketConnection(ws) {
  console.log("✅ WebSocket client connected (for signaling)")

  let peer = null

  ws.on("message", async (message) => {
    let data = null
    try {
      data = JSON.parse(message)
    } catch (err) {
      console.error("❌ Invalid JSON:", err)
      return
    }

    // Handle SDP offer
    if (data.type === "offer") {
      peer = new wrtc.RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
      })

      // Return ICE candidates back to client
      peer.onicecandidate = (event) => {
        if (event.candidate) {
          ws.send(JSON.stringify({ type: "candidate", candidate: event.candidate }))
        }
      }

      // Detect WebRTC connection state changes
      peer.onconnectionstatechange = () => {
        console.log("🔌 WebRTC state:", peer.connectionState)
        if (["disconnected", "failed", "closed"].includes(peer.connectionState)) {
          peer.close()
        }
      }

      //note focus here abs 
      peer.ontrack = (event) => {
        console.log("🎧 ontrack event fired")
        const [incomingStream] = event.streams
        if (incomingStream) {
          incomingStream.getTracks().forEach((track) => {
            // Log track details using available properties
            console.log(`🎤 Received ${track.kind} track with ID: ${track.id}`)

            if (track.kind === "audio") {
              console.log("🎤 Audio track detected")
              console.log("🔍 Track properties:", {
                id: track.id,
                kind: track.kind,
                enabled: track.enabled,
                readyState: track.readyState,
                muted: track.muted,
              })

              // Set up audio processing if needed
              setupAudioProcessing(incomingStream)

              track.onunmute = () => {
                console.log("🟢 Listening: user is speaking")
              }

              // Optionally: Detect when audio stops
              track.onmute = () => {
                console.log("🔴 Mic is muted or no audio")
              }
            }
          })
        }
      }

      // Set remote description from client
      await peer.setRemoteDescription(new wrtc.RTCSessionDescription(data.offer))
      const answer = await peer.createAnswer()
      await peer.setLocalDescription(answer)

      ws.send(JSON.stringify({ type: "answer", answer }))
    }

    // Handle incoming ICE candidates
    if (data.candidate && peer) {
      try {
        const candidate = new wrtc.RTCIceCandidate(data.candidate)
        await peer.addIceCandidate(candidate)
        console.log("📥 Added ICE candidate")
      } catch (err) {
        console.error("❌ Failed to add ICE candidate:", err)
      }
    }
  })

  ws.on("close", () => {
    console.log("❌ WebSocket disconnected")
    if (peer) peer.close()
  })
}

// Function to process audio from the incoming stream
function setupAudioProcessing(stream) {
  try {
    // Check if we have audio tracks
    const audioTracks = stream.getAudioTracks()
    if (audioTracks.length === 0) {
      console.log("❌ No audio tracks found in the stream")
      return
    }

    console.log(`✅ Found ${audioTracks.length} audio tracks`)

    // Set up a simple volume detector using raw audio data
    // Note: This is a simplified approach since wrtc doesn't support AudioContext
    let silenceDetectionTimeout = null
    let isSpeaking = false

    // Create a simple speaking detector based on track state changes
    audioTracks.forEach((track) => {
      // Listen for track state changes
      track.addEventListener("ended", () => {
        console.log("🔴 Audio track ended")
        isSpeaking = false
      })

      // We can't directly access audio levels in wrtc, but we can detect if the track is active
      if (track.enabled && track.readyState === "live") {
        console.log("🟢 Audio track is active and live")

        // Simple simulation of speech detection
        // In a real implementation, you would process the raw audio data
        if (!isSpeaking) {
          isSpeaking = true
          console.log("🎤 User appears to be speaking (track is active)")

          // Reset the silence detection after some time
          clearTimeout(silenceDetectionTimeout)
          silenceDetectionTimeout = setTimeout(() => {
            console.log("🔴 Silence detected (timeout)")
            isSpeaking = false
          }, 5000) // Assume silence after 5 seconds without track changes
        }
      }
    })

    // Log that we're ready to process audio
    console.log("✅ Audio processing setup complete")
  } catch (error) {
    console.error("❌ Error setting up audio processing:", error)
  }
}

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

      // Improved ontrack handler
      peer.ontrack = (event) => {
        console.log("🎧 ontrack event fired")
        const [incomingStream] = event.streams
        if (incomingStream) {
          incomingStream.getTracks().forEach((track) => {
            // Log track details using available properties
            console.log(`🎤 Received ${track.kind} track with ID: ${track.id}`)

            //note track details 
            if (track.kind === "audio") {
              console.log("🎤 Audio track detected")
              console.log("🔍 Track properties:", {
                id: track.id,
                kind: track.kind,
                enabled: track.enabled,
                readyState: track.readyState,
                muted: track.muted,
              })

              // note Set up continuous audio monitoring instead of timeout-based
              setupContinuousAudioMonitoring(incomingStream, track, ws)

              // Original event handlers
              track.onunmute = () => {
                console.log("🟢 Listening: user is speaking (onunmute)")
                ws.send(JSON.stringify({ type: "audio_status", status: "speaking" }))
              }

              track.onmute = () => {
                console.log("🔴 Mic is muted or no audio (onmute)")
                ws.send(JSON.stringify({ type: "audio_status", status: "silent" }))
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

    // Handle heartbeat messages from client
    if (data.type === "heartbeat") {
      ws.send(JSON.stringify({ type: "heartbeat_ack" }))
    }
  })

  ws.on("close", () => {
    console.log("❌ WebSocket disconnected")
    if (peer) peer.close()
  })
}

// note  Improved continuous audio monitoring function
function setupContinuousAudioMonitoring(stream, track, ws) {
  try {
    // note  Check if track is valid
    if (!track || track.readyState !== "live") {
      console.log("❌ Audio track is not live")
      return
    }

    const audioTracks = stream.getAudioTracks()
    if (audioTracks.length === 0) {
      console.log("❌ No audio tracks found for speech-to-text")
      return
    }

    console.log("✅ Setting up continuous audio monitoring")

    // Track state for speaking detection
    let lastActiveState = track.enabled
    let checkCount = 0
    let consecutiveSilentChecks = 0
    let consecutiveActiveChecks = 0

    // note Instead of a timeout, use an interval to continuously check track state
    const monitoringInterval = setInterval(() => {
      // Only continue if track is still valid
      if (track.readyState !== "live") {
        console.log("❌ Audio track is no longer live, stopping monitoring")
        clearInterval(monitoringInterval)
        return
      }

      checkCount++

      // Check if track is enabled and active
      const isActive = track.enabled && !track.muted

      // If state changed, log it
      if (isActive !== lastActiveState) {
        console.log(`🔄 Audio track state changed: ${isActive ? "active" : "inactive"}`)
        lastActiveState = isActive
      }

      // Count consecutive checks in each state
      if (isActive) {
        consecutiveSilentChecks = 0
        consecutiveActiveChecks++

        // After a few consecutive active checks, consider the user speaking
        if (consecutiveActiveChecks === 3) {
          console.log("🎤 User is speaking (continuous monitoring)")
          ws.send(JSON.stringify({ type: "audio_status", status: "speaking" }))
        }
      } else {
        consecutiveActiveChecks = 0
        consecutiveSilentChecks++

        // Only report silence after several consecutive silent checks
        // This prevents false silence detection during normal speech pauses
        if (consecutiveSilentChecks === 10) {
          console.log("🔇 User is silent (continuous monitoring)")
          ws.send(JSON.stringify({ type: "audio_status", status: "silent" }))
        }
      }

      // Every 30 checks (about 15 seconds), log the current state
      if (checkCount % 30 === 0) {
        console.log(`🔍 Audio monitoring check #${checkCount}: ${isActive ? "active" : "inactive"}`)
      }
    }, 500) // Check every 500ms instead of using a timeout

    // Clean up the interval if the track ends
    track.addEventListener("ended", () => {
      console.log("🛑 Audio track ended, stopping monitoring")
      clearInterval(monitoringInterval)
    })

    console.log("✅ Continuous audio monitoring setup complete")
  } catch (error) {
    console.error("❌ Error setting up audio monitoring:", error)
  }
}

// Original function kept for reference
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

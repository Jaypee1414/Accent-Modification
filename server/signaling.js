import wrtc from "wrtc"

export function handleWebSocketConnection(ws) {
  console.log("✅ WebSocket client connected (for signaling)")

  let peer = null
  let audioActivityInterval = null
  let lastPacketTime = 0
  let packetCounter = 0
  let isAudioActive = false

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
          if (audioActivityInterval) {
            clearInterval(audioActivityInterval)
            audioActivityInterval = null
          }
        }
      }

      //  note Enhanced ontrack handler with basic audio activity detection
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

              // Set up continuous audio monitoring
              setupContinuousAudioMonitoring(incomingStream, track, ws)

              // Set up basic audio activity detection
              setupBasicAudioDetection(track, ws)

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

    // Handle client audio metrics
    if (data.type === "client_audio_metrics" && data.metrics) {
      console.log("📊 Received client audio metrics:", data.metrics)

      // Forward these metrics back to the client with server timestamp
      ws.send(
        JSON.stringify({
          type: "audio_metrics",
          metrics: {
            ...data.metrics,
            serverTimestamp: Date.now(),
            serverReceived: true,
          },
        }),
      )
    }

    // Handle heartbeat messages from client
    if (data.type === "heartbeat") {
      ws.send(JSON.stringify({ type: "heartbeat_ack" }))
    }
  })

  ws.on("close", () => {
    console.log("❌ WebSocket disconnected")
    if (peer) peer.close()
    if (audioActivityInterval) {
      clearInterval(audioActivityInterval)
      audioActivityInterval = null
    }
  })

  // Function to set up basic audio detection using RTP packet timing
  function setupBasicAudioDetection(track, ws) {
    try {
      console.log("✅ Setting up basic audio detection")

      if (audioActivityInterval) {
        clearInterval(audioActivityInterval)
      }

      // Initialize counters
      lastPacketTime = Date.now()
      packetCounter = 0
      isAudioActive = false

      // Set up interval to check audio activity
      audioActivityInterval = setInterval(() => {
        // Check if track is still valid
        if (track.readyState !== "live") {
          console.log("❌ Audio track is no longer live")
          clearInterval(audioActivityInterval)
          audioActivityInterval = null
          return
        }

        // Check if track is enabled and not muted
        const trackActive = track.enabled && !track.muted

        // Increment packet counter (this is just a proxy for activity)
        packetCounter++

        // Calculate time since last check
        const now = Date.now()
        const timeSinceLastCheck = now - lastPacketTime
        lastPacketTime = now

        // Log basic activity info
        console.log(`🔍 Audio check: Track active=${trackActive}, Time since last check=${timeSinceLastCheck}ms`)

        // Determine if audio is active based on track state
        const newAudioState = trackActive

        // If state changed, notify client
        if (newAudioState !== isAudioActive) {
          isAudioActive = newAudioState
          console.log(`🔊 Audio activity changed: ${isAudioActive ? "ACTIVE" : "INACTIVE"}`)

          ws.send(
            JSON.stringify({
              type: "audio_status",
              status: isAudioActive ? "speaking" : "silent",
            }),
          )
        }

        // Send basic audio metrics to client
        ws.send(
          JSON.stringify({
            type: "audio_metrics",
            metrics: {
              active: isAudioActive,
              trackEnabled: track,
              trackMuted: track.muted,
              trackState: track.readyState,
              serverTimestamp: Date.now(),
              // We can't measure these directly, so we'll use placeholders
              level: isAudioActive ? -30 : -90, // Placeholder dB level
              volumeLevel: isAudioActive ? "Active" : "Silent",
              quality: "Unknown (Server cannot measure)",
              packetCounter: packetCounter,
              timeSinceLastCheck: timeSinceLastCheck,
            },
          }),
        )

        // Log server-side audio status
        console.log(`🎤 Server audio status: ${isAudioActive ? "ACTIVE" : "INACTIVE"}`)
      }, 1000) // Check every second

      console.log("✅ Basic audio detection setup complete")
    } catch (error) {
      console.error("❌ Error setting up basic audio detection:", error)
    }
  }
}

// note Continuous audio monitoring function
function setupContinuousAudioMonitoring(stream, track, ws) {
  try {
    console.log("Check")
    // Check if track is valid
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

    // Instead of a timeout, use an interval to continuously check track state
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

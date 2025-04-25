const wrtc = require("wrtc")
const { RTCAudioSink } = wrtc.nonstandard
const fs = require("fs")
const wav = require("wav")

function handleWebSocketConnection(ws) {
  console.log("✅ WebSocket client connected (for signaling)")

  let peer = null
  let audioActivityInterval = null
  let fileStream = null
  let wavWriter = null
  let sink = null
  let recordingStartTime = null

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
        iceServers: [
          { urls: "stun:stun.l.google.com:19302" },
          { urls: "stun:stun1.l.google.com:19302" },
          { urls: "stun:stun2.l.google.com:19302" },
        ],
      })

      // Return ICE candidates back to client
      peer.onicecandidate = (event) => {
        if (event.candidate) {
          ws.send(JSON.stringify({ type: "ice-candidate", candidate: event.candidate }))
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
          // Close the WAV file when connection ends
          finalizeRecording()
        }
      }

      // Enhanced ontrack handler with improved audio processing
      peer.ontrack = (event) => {
        console.log("🎧 ontrack event fired")
        const [incomingStream] = event.streams
        const [audioTrack] = event.streams[0].getAudioTracks()

        // Record the start time
        recordingStartTime = Date.now()

        // Use high quality settings for audio recording
        const sampleRate = 48000 // High quality sample rate
        console.log(`Using sample rate: ${sampleRate}Hz`)

        // Create audio sink from the track
        sink = new RTCAudioSink(audioTrack)

        // Create a unique filename with timestamp
        const filename = `high_quality_audio_${Date.now()}.wav`
        console.log(`📝 Creating WAV file: ${filename}`)

        // Initialize WAV file writer with high quality settings
        fileStream = fs.createWriteStream(filename)
        wavWriter = new wav.Writer({
          sampleRate: sampleRate,
          channels: 1, // mono
          bitDepth: 16, // 16-bit PCM
        })
        wavWriter.pipe(fileStream)

        // Audio processing parameters
        const GAIN = 3.5 // Higher gain for clearer audio
        const NOISE_GATE_THRESHOLD = 0.003 // Lower threshold to capture more audio
        const BUFFER_SIZE = 8192 // Larger buffer for better processing

        // Buffer to accumulate samples for better processing
        let sampleBuffer = []

        // Peak level tracking for normalization
        let peakLevel = 0

        try {
          sink.ondata = ({ samples, sampleRate: frameSampleRate }) => {
            if (frameSampleRate && frameSampleRate !== sampleRate) {
              console.log(`Note: Frame sample rate (${frameSampleRate}) differs from configured rate (${sampleRate})`)
            }

            // Process audio for better quality
            const processedSamples = new Float32Array(samples.length)

            // First pass: measure peak levels and apply initial processing
            for (let i = 0; i < samples.length; i++) {
              let sample = samples[i]

              // Apply noise gate (reduce very low signals)
              if (Math.abs(sample) < NOISE_GATE_THRESHOLD) {
                sample *= 0.3 // Reduce noise floor
              }

              // Apply gain to increase volume
              sample *= GAIN

              // Track peak level for normalization
              if (Math.abs(sample) > peakLevel) {
                peakLevel = Math.abs(sample)
              }

              processedSamples[i] = sample
            }

            // Second pass: normalize if needed to prevent clipping
            if (peakLevel > 1.0) {
              const normalizationFactor = 0.95 / peakLevel // Leave a little headroom
              for (let i = 0; i < processedSamples.length; i++) {
                processedSamples[i] *= normalizationFactor
              }
            }

            // Add processed samples to buffer
            sampleBuffer = sampleBuffer.concat(Array.from(processedSamples))

            // Process when buffer reaches threshold
            if (sampleBuffer.length >= BUFFER_SIZE) {
              // Apply a simple low-pass filter to smooth out harsh frequencies
              const smoothedBuffer = new Array(sampleBuffer.length)

              // Simple 3-point moving average filter
              for (let i = 0; i < sampleBuffer.length; i++) {
                if (i > 0 && i < sampleBuffer.length - 1) {
                  // Middle samples get averaged with neighbors
                  smoothedBuffer[i] = (sampleBuffer[i - 1] + sampleBuffer[i] * 2 + sampleBuffer[i + 1]) / 4
                } else {
                  // Edge samples stay the same
                  smoothedBuffer[i] = sampleBuffer[i]
                }
              }

              // Convert Float32 to Int16 PCM with proper scaling
              const int16Samples = new Int16Array(smoothedBuffer.length)
              for (let i = 0; i < smoothedBuffer.length; i++) {
                // Ensure we're within [-1, 1] bounds
                const s = Math.max(-1, Math.min(1, smoothedBuffer[i]))
                // Scale to 16-bit PCM range with proper rounding
                int16Samples[i] = Math.round(s * 32767)
              }

              // Write to WAV
              wavWriter.write(Buffer.from(int16Samples.buffer))

              // Reset buffer
              sampleBuffer = []
            }
          }
        } catch (error) {
          console.log("Audio sink error:", error)
        }

        // Clean up when track ends
        audioTrack.onended = () => {
          finalizeRecording()
        }

        // Rest of your existing track handling code...
        if (incomingStream) {
          incomingStream.getTracks().forEach((track) => {
            if (track.kind === "audio") {
              console.log("🎤 Audio track detected")
            }
          })
        }
      }

      // Set remote description from client
      await peer.setRemoteDescription(new wrtc.RTCSessionDescription(data.offer))

      // Create answer with high-quality audio preferences
      const answer = await peer.createAnswer({
        voiceActivityDetection: false,
      })

      // Modify SDP to ensure high quality audio
      if (answer.sdp) {
        let sdp = answer.sdp

        // Set Opus codec with high quality parameters
        sdp = sdp.replace(
          /a=rtpmap:(\d+) opus\/48000\/2/g,
          "a=rtpmap:$1 opus/48000/2\r\n" +
            "a=fmtp:$1 minptime=10;useinbandfec=1;stereo=0;sprop-stereo=0;cbr=1;maxaveragebitrate=510000;maxplaybackrate=48000;ptime=20;maxptime=40",
        )

        answer.sdp = sdp
      }

      await peer.setLocalDescription(answer)
      ws.send(JSON.stringify({ type: "answer", answer }))
    }

    // Handle incoming ICE candidates
    if (data.type === "ice-candidate" && peer) {
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
    // Ensure WAV file is properly closed
    finalizeRecording()
  })

  // Helper function to finalize the recording
  function finalizeRecording() {
    if (sink) {
      sink.stop()
      sink = null
    }

    if (wavWriter) {
      try {
        wavWriter.end()
        const recordingDuration = recordingStartTime ? Math.round((Date.now() - recordingStartTime) / 1000) : 0
        console.log(`✅ WAV file saved successfully. Duration: ${recordingDuration} seconds`)
      } catch (err) {
        console.error("Error finalizing WAV file:", err)
      }
      wavWriter = null
    }

    if (fileStream) {
      fileStream = null
    }
  }
}

module.exports = { handleWebSocketConnection }

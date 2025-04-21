"use client"
import { useEffect, useState, useRef } from "react"

// Define the types for the WebSocket message
interface SignalingMessage {
  type: "offer" | "answer" | "candidate" | "audio_status" | "heartbeat_ack" | "audio_metrics"
  offer?: RTCSessionDescriptionInit
  answer?: RTCSessionDescriptionInit
  candidate?: RTCIceCandidateInit
  status?: string
  metrics?: {
    level: number
    volumeLevel: string
    quality: string
    packetCounter?: number
    timeSinceLastCheck?: number
    active?: boolean
    trackEnabled?: boolean
    trackMuted?: boolean
    trackState?: string
    serverTimestamp?: number
    serverReceived?: boolean
  }
}

const WebRTCClient = () => {
  const [peerConnection, setPeerConnection] = useState<RTCPeerConnection | null>(null)
  const [ws, setWs] = useState<WebSocket | null>(null)
  const [isListening, setIsListening] = useState(false)
  const [mediaStream, setMediaStream] = useState<MediaStream | null>(null)
  const [audioFeedback, setAudioFeedback] = useState(false)
  const [connectionStatus, setConnectionStatus] = useState("disconnected")
  const [audioLevel, setAudioLevel] = useState(0)
  const [serverDetectedSpeech, setServerDetectedSpeech] = useState(false)
  const [feedbackVolume, setFeedbackVolume] = useState(1.0) // Default volume at 100%
  const [serverAudioMetrics, setServerAudioMetrics] = useState<{
    level: number
    volumeLevel: string
    quality: string
    packetCounter?: number
    timeSinceLastCheck?: number
    active?: boolean
    trackEnabled?: boolean
    trackMuted?: boolean
    trackState?: string
    serverTimestamp?: number
    serverReceived?: boolean
  } | null>(null)
  const [clientAudioMetrics, setClientAudioMetrics] = useState<{
    level: number
    volumeLevel: string
    quality: string
  } | null>(null)

  const audioRef = useRef<HTMLAudioElement>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const animationFrameRef = useRef<number | null>(null)
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const gainNodeRef = useRef<GainNode | null>(null) // Added gain node reference
  const audioSourceRef = useRef<MediaStreamAudioSourceNode | null>(null) // Added source node reference
  const metricsIntervalRef = useRef<NodeJS.Timeout | null>(null) // For sending metrics to server

  // Handle signaling messages from the WebSocket server
  const handleSignalingMessage = async (data: SignalingMessage) => {
    if (
      !peerConnection &&
      data.type !== "audio_status" &&
      data.type !== "heartbeat_ack" &&
      data.type !== "audio_metrics"
    )
      return

    switch (data.type) {
      case "answer":
        if (data.answer) {
          console.log("📥 Received answer from server")
          await peerConnection?.setRemoteDescription(data.answer)
          setConnectionStatus("connected")

          // Start sending heartbeats after connection is established
          startHeartbeat()

          // Start sending audio metrics to server
          startSendingAudioMetrics()
        }
        break
      case "candidate":
        if (data.candidate) {
          console.log("📥 Received ICE candidate from server")
          const candidate = new RTCIceCandidate(data.candidate)
          await peerConnection?.addIceCandidate(candidate)
        }
        break
      case "audio_status":
        // Handle audio status messages from server
        if (data.status === "speaking") {
          console.log("🎙️ Server detected speech")
          setServerDetectedSpeech(true)
        } else if (data.status === "silent") {
          console.log("🔇 Server detected silence")
          setServerDetectedSpeech(false)
        }
        break
      case "audio_metrics":
        // Handle audio metrics from server
        if (data.metrics) {
          console.log("📊 Received audio metrics from server:", data.metrics)
          setServerAudioMetrics(data.metrics)
        }
        break
      case "heartbeat_ack":
        // Server acknowledged our heartbeat
        console.log("💓 Heartbeat acknowledged")
        break
      default:
        break
    }
  }

  // Start sending audio metrics to server
  const startSendingAudioMetrics = () => {
    // Clear any existing interval
    if (metricsIntervalRef.current) {
      clearInterval(metricsIntervalRef.current)
    }

    // Send audio metrics every second
    metricsIntervalRef.current = setInterval(() => {
      if (ws && ws.readyState === WebSocket.OPEN && clientAudioMetrics) {
        ws.send(
          JSON.stringify({
            type: "client_audio_metrics",
            metrics: {
              ...clientAudioMetrics,
              clientTimestamp: Date.now(),
            },
          }),
        )
      }
    }, 1000)
  }

  // Start sending heartbeats to keep the connection alive
  const startHeartbeat = () => {
    // Clear any existing interval
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current)
    }

    // Send heartbeat every 5 seconds
    heartbeatIntervalRef.current = setInterval(() => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "heartbeat" }))
      }
    }, 5000)
  }

  // Get user media (microphone) with specific constraints
  const getUserMedia = async () => {
    try {
      // Use specific audio constraints for better quality and compatibility
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false, // Disable echo cancellation for clearer feedback
          noiseSuppression: false, // Disable noise suppression for clearer feedback
          autoGainControl: true, // Keep auto gain control for better volume
          // Higher sample rate for better audio quality
          sampleRate: 44100,
        },
      })

      console.log("🎤 Microphone access granted")
      const audioTracks = stream.getAudioTracks()
      console.log(`🎤 Audio tracks: ${audioTracks.length}`)

      if (audioTracks.length > 0) {
        const track = audioTracks[0]
        console.log(`🎤 Track ID: ${track.id}`)
        console.log(`🎤 Track label: ${track.label}`)

        // Log track settings in browser
        try {
          console.log(`🎤 Track settings:`, track.getSettings())

          // Apply constraints to improve audio quality
          await track.applyConstraints({
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: true,
          })
        } catch (e) {
          console.error("Error getting track settings:", e)
        }
      }

      setMediaStream(stream)
      return stream
    } catch (error) {
      console.error("Error accessing microphone:", error)
      return null
    }
  }

  // Set up audio feedback with Web Audio API for better control
  const setupAudioFeedback = (stream: MediaStream) => {
    try {
      // Create AudioContext if it doesn't exist
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContext({ sampleRate: 44100 })
      }

      const audioContext = audioContextRef.current

      // Clean up previous connections
      if (audioSourceRef.current) {
        audioSourceRef.current.disconnect()
      }
      if (gainNodeRef.current) {
        gainNodeRef.current.disconnect()
      }

      // Create source from the stream
      const source = audioContext.createMediaStreamSource(stream)
      audioSourceRef.current = source

      // Create a gain node for volume control
      const gainNode = audioContext.createGain()
      gainNode.gain.value = feedbackVolume
      gainNodeRef.current = gainNode

      // Connect source -> gain -> destination (speakers)
      source.connect(gainNode)
      gainNode.connect(audioContext.destination)

      console.log("🔊 Audio feedback set up with gain:", feedbackVolume)
    } catch (error) {
      console.error("Error setting up audio feedback:", error)
    }
  }

  // Toggle audio feedback
  const toggleAudioFeedback = () => {
    const newFeedbackState = !audioFeedback
    setAudioFeedback(newFeedbackState)

    if (newFeedbackState && mediaStream) {
      // Set up audio feedback with Web Audio API
      setupAudioFeedback(mediaStream)
    } else if (!newFeedbackState && gainNodeRef.current) {
      // Disconnect gain node to stop feedback
      gainNodeRef.current.disconnect()
    }
  }

  // Update feedback volume
  const updateFeedbackVolume = (volume: number) => {
    setFeedbackVolume(volume)
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = volume
      console.log(`🔊 Updated feedback volume: ${volume}`)
    }
  }

  // Create the peer connection
  const createPeerConnection = async () => {
    const stream = await getUserMedia()
    if (!stream) return null

    const peer = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    })

    // Add audio tracks to the peer connection
    stream.getAudioTracks().forEach((track) => {
      console.log(`🎤 Adding track to peer connection: ${track.id}`)
      peer.addTrack(track, stream)
    })

    peer.onicecandidate = (event) => {
      if (event.candidate) {
        console.log("📤 Sending ICE candidate to server")
        ws?.send(JSON.stringify({ type: "candidate", candidate: event.candidate }))
      }
    }

    peer.onconnectionstatechange = () => {
      console.log(`🔌 Connection state: ${peer.connectionState}`)
      setConnectionStatus(peer.connectionState)

      // Stop heartbeat if connection is closed
      if (peer.connectionState === "closed" || peer.connectionState === "failed") {
        if (heartbeatIntervalRef.current) {
          clearInterval(heartbeatIntervalRef.current)
          heartbeatIntervalRef.current = null
        }
        if (metricsIntervalRef.current) {
          clearInterval(metricsIntervalRef.current)
          metricsIntervalRef.current = null
        }
      }
    }

    peer.oniceconnectionstatechange = () => {
      console.log(`❄️ ICE connection state: ${peer.iceConnectionState}`)
    }

    // Set up audio level detection to show when actively listening
    setupAudioLevelDetection(stream)

    setPeerConnection(peer)
    return peer
  }

  // Setup audio level detection with optimizations for shared use
  const setupAudioLevelDetection = (stream: MediaStream) => {
    try {
      // Create or reuse AudioContext
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContext({ sampleRate: 44100 })
      }

      const audioContext = audioContextRef.current
      const source = audioContext.createMediaStreamSource(stream)
      const analyser = audioContext.createAnalyser()

      // Use moderate FFT size for better frequency resolution
      analyser.fftSize = 256
      source.connect(analyser)
      analyserRef.current = analyser

      const bufferLength = analyser.frequencyBinCount
      const dataArray = new Uint8Array(bufferLength)

      // Cancel existing animation frame if it exists
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }

      const checkAudioLevel = () => {
        if (!analyserRef.current) return

        analyserRef.current.getByteFrequencyData(dataArray)

        // Calculate average volume level
        let sum = 0
        for (let i = 0; i < bufferLength; i++) {
          sum += dataArray[i]
        }
        const average = sum / bufferLength
        setAudioLevel(average)

        // Set listening state based on volume threshold
        const isActive = average > 10
        setIsListening(isActive)

        // Calculate audio metrics for client-side
        if (isActive) {
          console.log(`🔊 Speaking - Audio level: ${average.toFixed(2)}`)

          // Convert to dB scale (0-1 to a more readable scale)
          // Map 0-255 to -100dB to 0dB
          const normalizedLevel = average / 255
          const dbLevel = normalizedLevel === 0 ? -100 : 20 * Math.log10(normalizedLevel)

          // Determine volume level
          let volumeLevel = "Silent"
          if (dbLevel > -20) {
            volumeLevel = "Loud"
          } else if (dbLevel > -40) {
            volumeLevel = "Normal"
          } else if (dbLevel > -60) {
            volumeLevel = "Soft"
          } else {
            volumeLevel = "Very Soft"
          }

          // Determine quality based on level consistency
          // This is a simplified approach since we can't measure packet loss client-side
          let quality = "Unknown"
          if (average > 50) {
            quality = "Good"
          } else if (average > 20) {
            quality = "Fair"
          } else {
            quality = "Poor"
          }

          // Update client audio metrics
          setClientAudioMetrics({
            level: dbLevel,
            volumeLevel,
            quality,
          })
        }

        // Check less frequently to reduce CPU usage
        setTimeout(() => {
          animationFrameRef.current = requestAnimationFrame(checkAudioLevel)
        }, 100)
      }

      animationFrameRef.current = requestAnimationFrame(checkAudioLevel)
    } catch (error) {
      console.error("Error setting up audio level detection:", error)
    }
  }

  // Start communication by creating an offer
  const startCommunication = async () => {
    const peer = peerConnection || (await createPeerConnection())
    if (!peer) return

    try {
      console.log("📤 Creating and sending offer")
      const offer = await peer.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: false,
        voiceActivityDetection: true,
      })
      await peer.setLocalDescription(offer)

      // Send the offer to the backend
      ws?.send(JSON.stringify({ type: "offer", offer }))
      setConnectionStatus("connecting")
    } catch (error) {
      console.error("Error creating offer:", error)
    }
  }

  // Stop communication and release resources
  const stopCommunication = () => {
    // Stop heartbeat
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current)
      heartbeatIntervalRef.current = null
    }

    // Stop metrics interval
    if (metricsIntervalRef.current) {
      clearInterval(metricsIntervalRef.current)
      metricsIntervalRef.current = null
    }

    if (mediaStream) {
      mediaStream.getTracks().forEach((track) => {
        console.log(`🛑 Stopping track: ${track.id}`)
        track.stop()
      })
      setMediaStream(null)
    }

    if (peerConnection) {
      peerConnection.close()
      setPeerConnection(null)
    }

    if (audioContextRef.current) {
      audioContextRef.current.close().catch((err) => console.error("Error closing audio context:", err))
      audioContextRef.current = null
      analyserRef.current = null
    }

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
    }

    setIsListening(false)
    setAudioFeedback(false)
    setConnectionStatus("disconnected")
    setAudioLevel(0)
    setServerDetectedSpeech(false)
    setServerAudioMetrics(null)
    setClientAudioMetrics(null)
  }

  useEffect(() => {
    const socket = new WebSocket("ws://localhost:3001")
    setWs(socket)

    socket.onopen = () => {
      console.log("WebSocket connected!")
    }

    socket.onmessage = (event) => {
      try {
        const data: SignalingMessage = JSON.parse(event.data)
        handleSignalingMessage(data)
      } catch (error) {
        console.error("Error parsing WebSocket message:", error)
      }
    }

    socket.onerror = (error) => {
      console.error("WebSocket error:", error)
    }

    socket.onclose = () => {
      console.log("WebSocket connection closed.")
      stopCommunication()
    }

    return () => {
      socket.close()
      stopCommunication()
    }
  }, [])

  // Get color for audio level display
  const getAudioLevelColor = (level: number) => {
    if (level > -20) return "text-green-600"
    if (level > -40) return "text-blue-600"
    if (level > -60) return "text-yellow-600"
    return "text-red-600"
  }

  // Get color for quality display
  const getQualityColor = (quality: string) => {
    switch (quality) {
      case "Excellent":
      case "Good":
        return "text-green-600"
      case "Fair":
        return "text-blue-600"
      case "Poor":
        return "text-yellow-600"
      default:
        return "text-gray-600"
    }
  }

  return (
    <div className="p-6 max-w-md mx-auto">
      <div className="flex flex-col items-center gap-4">
        <div className="text-xl font-bold">AI accent modification</div>

        <div
          className={`px-4 py-2 rounded-full flex items-center ${
            connectionStatus === "connected"
              ? "bg-blue-100 text-blue-800"
              : connectionStatus === "connecting"
                ? "bg-yellow-100 text-yellow-800"
                : "bg-gray-100 text-gray-800"
          }`}
        >
          <div
            className={`w-3 h-3 rounded-full mr-2 ${
              connectionStatus === "connected"
                ? "bg-blue-500"
                : connectionStatus === "connecting"
                  ? "bg-yellow-500"
                  : "bg-gray-500"
            }`}
          ></div>
          Status: {connectionStatus}
        </div>

        {/* Display both client and server speech detection */}
        <div className="flex gap-2 w-full">
          <div
            className={`flex-1 px-4 py-2 rounded-md flex items-center justify-center ${
              isListening ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"
            }`}
          >
            <div className={`w-3 h-3 rounded-full mr-2 ${isListening ? "bg-green-500" : "bg-gray-500"}`}></div>
            Client: {isListening ? "Speaking" : "Silent"}
          </div>

          <div
            className={`flex-1 px-4 py-2 rounded-md flex items-center justify-center ${
              serverDetectedSpeech ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"
            }`}
          >
            <div className={`w-3 h-3 rounded-full mr-2 ${serverDetectedSpeech ? "bg-green-500" : "bg-gray-500"}`}></div>
            Server: {serverDetectedSpeech ? "Speaking" : "Silent"}
          </div>
        </div>

        {/* Audio level meter */}
        {mediaStream && (
          <div className="w-full bg-gray-200 rounded-full h-2.5 mb-4">
            <div
              className="bg-green-600 h-2.5 rounded-full transition-all duration-100"
              style={{ width: `${Math.min(audioLevel * 2, 100)}%` }}
            ></div>
          </div>
        )}

        {/* Server audio metrics display */}
        {serverAudioMetrics && (
          <div className="w-full p-4 bg-gray-50 rounded-lg border border-gray-200">
            <h3 className="font-medium text-gray-900 mb-2">Server Audio Metrics:</h3>
            <div className="grid grid-cols-2 gap-2">
              <div className="text-sm">
                <span className="text-gray-500">Status: </span>
                <span className={serverAudioMetrics.active ? "text-green-600" : "text-red-600"}>
                  {serverAudioMetrics.active ? "Active" : "Inactive"}
                </span>
              </div>
              <div className="text-sm">
                <span className="text-gray-500">Volume: </span>
                <span className={getAudioLevelColor(serverAudioMetrics.level)}>{serverAudioMetrics.volumeLevel}</span>
              </div>
              <div className="text-sm">
                <span className="text-gray-500">Track State: </span>
                <span className="text-blue-600">{serverAudioMetrics.trackState || "Unknown"}</span>
              </div>
              <div className="text-sm">
                <span className="text-gray-500">Last Check: </span>
                <span className="text-blue-600">
                  {serverAudioMetrics.timeSinceLastCheck ? `${serverAudioMetrics.timeSinceLastCheck}ms` : "Unknown"}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Client audio metrics display */}
        {clientAudioMetrics && (
          <div className="w-full p-4 bg-gray-50 rounded-lg border border-gray-200 mt-2">
            <h3 className="font-medium text-gray-900 mb-2">Client Audio Metrics:</h3>
            <div className="grid grid-cols-2 gap-2">
              <div className="text-sm">
                <span className="text-gray-500">Volume: </span>
                <span className={getAudioLevelColor(clientAudioMetrics.level)}>
                  {clientAudioMetrics.volumeLevel} ({clientAudioMetrics.level.toFixed(1)} dB)
                </span>
              </div>
              <div className="text-sm">
                <span className="text-gray-500">Quality: </span>
                <span className={getQualityColor(clientAudioMetrics.quality)}>{clientAudioMetrics.quality}</span>
              </div>
            </div>
          </div>
        )}

        {/* Hidden audio element for feedback */}
        <audio ref={audioRef} className="hidden" />

        <div className="flex gap-4">
          <button
            onClick={startCommunication}
            disabled={connectionStatus === "connected" || connectionStatus === "connecting"}
            className={`${
              connectionStatus === "connected" || connectionStatus === "connecting"
                ? "bg-gray-400 cursor-not-allowed"
                : "bg-blue-500 hover:bg-blue-600"
            } text-white px-4 py-2 rounded`}
          >
            Start Communication
          </button>

          <button
            onClick={stopCommunication}
            disabled={connectionStatus === "disconnected"}
            className={`${
              connectionStatus === "disconnected" ? "bg-gray-400 cursor-not-allowed" : "bg-red-500 hover:bg-red-600"
            } text-white px-4 py-2 rounded`}
          >
            Stop
          </button>
        </div>

        {mediaStream && (
          <div className="mt-2 w-full">
            <label className="flex items-center space-x-2 cursor-pointer mb-2">
              <input
                type="checkbox"
                checked={audioFeedback}
                onChange={toggleAudioFeedback}
                className="form-checkbox h-5 w-5 text-blue-600"
              />
              <span>Hear my voice (audio feedback)</span>
            </label>

            {/* Volume control slider for audio feedback */}
            {audioFeedback && (
              <div className="mt-2 w-full">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Feedback Volume: {Math.round(feedbackVolume * 100)}%
                </label>
                <input
                  type="range"
                  min="0"
                  max="2"
                  step="0.1"
                  value={feedbackVolume}
                  onChange={(e) => updateFeedbackVolume(Number.parseFloat(e.target.value))}
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                />
              </div>
            )}
          </div>
        )}

        {audioFeedback && (
          <div className="text-sm text-gray-600 mt-1">Use the volume slider above to adjust feedback volume</div>
        )}

        {/* Tips for better audio quality */}
        <div className="mt-4 text-sm text-gray-700 bg-blue-50 p-3 rounded-md w-full">
          <h3 className="font-bold mb-1">Audio Quality Tips:</h3>
          <ul className="list-disc pl-5 space-y-1">
            <li>Use headphones to prevent feedback loops</li>
            <li>Speak clearly and at a consistent volume</li>
            <li>Position your microphone properly (4-6 inches away)</li>
            <li>Adjust the feedback volume slider for optimal monitoring</li>
          </ul>
        </div>
      </div>
    </div>
  )
}

export default WebRTCClient

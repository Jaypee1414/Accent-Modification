"use client"
import { useEffect, useState, useRef } from "react"

// Define the types for the WebSocket message
interface SignalingMessage {
  type: "offer" | "answer" | "candidate"
  offer?: RTCSessionDescriptionInit
  answer?: RTCSessionDescriptionInit
  candidate?: RTCIceCandidateInit
}

const WebRTCClient = () => {
  const [peerConnection, setPeerConnection] = useState<RTCPeerConnection | null>(null)
  const [ws, setWs] = useState<WebSocket | null>(null)
  const [isListening, setIsListening] = useState(false)
  const [mediaStream, setMediaStream] = useState<MediaStream | null>(null)
  const [audioFeedback, setAudioFeedback] = useState(false)
  const [connectionStatus, setConnectionStatus] = useState("disconnected")
  const [audioLevel, setAudioLevel] = useState(0)
  const audioRef = useRef<HTMLAudioElement>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const animationFrameRef = useRef<number | null>(null)

  // Handle signaling messages from the WebSocket server
  const handleSignalingMessage = async (data: SignalingMessage) => {
    if (!peerConnection) return

    switch (data.type) {
      case "answer":
        if (data.answer) {
          console.log("📥 Received answer from server")
          await peerConnection.setRemoteDescription(data.answer)
          setConnectionStatus("connected")
        }
        break
      case "candidate":
        if (data.candidate) {
          console.log("📥 Received ICE candidate from server")
          const candidate = new RTCIceCandidate(data.candidate)
          await peerConnection.addIceCandidate(candidate)
        }
        break
      default:
        break
    }
  }

  // Get user media (microphone) with specific constraints
  const getUserMedia = async () => {
    try {
      // Use specific audio constraints for better quality
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
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

  // Toggle audio feedback
  const toggleAudioFeedback = () => {
    setAudioFeedback(!audioFeedback)
  }

  // Update audio element when audio feedback state changes
  useEffect(() => {
    if (audioRef.current && mediaStream) {
      if (audioFeedback) {
        audioRef.current.srcObject = mediaStream
        audioRef.current.play().catch((err) => console.error("Error playing audio:", err))
      } else {
        audioRef.current.srcObject = null
      }
    }
  }, [audioFeedback, mediaStream])

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
    }

    peer.oniceconnectionstatechange = () => {
      console.log(`❄️ ICE connection state: ${peer.iceConnectionState}`)
    }

    // Set up audio level detection to show when actively listening
    setupAudioLevelDetection(stream)

    setPeerConnection(peer)
    return peer
  }

  // Setup audio level detection
  const setupAudioLevelDetection = (stream: MediaStream) => {
    try {
      // Create or reuse AudioContext
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContext()
      }

      const audioContext = audioContextRef.current
      const source = audioContext.createMediaStreamSource(stream)
      const analyser = audioContext.createAnalyser()
      analyser.fftSize = 256
      source.connect(analyser)
      analyserRef.current = analyser

      const bufferLength = analyser.frequencyBinCount
      const dataArray = new Uint8Array(bufferLength)

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

        if (isActive) {
          console.log(`🔊 Speaking - Audio level: ${average.toFixed(2)}`)
        }

        // Continue checking audio levels
        animationFrameRef.current = requestAnimationFrame(checkAudioLevel)
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

        {isListening && (
          <div className="bg-green-100 text-green-800 px-4 py-2 rounded-full animate-pulse flex items-center">
            <div className="w-3 h-3 bg-green-500 rounded-full mr-2"></div>
            Listening... (Level: {audioLevel.toFixed(1)})
          </div>
        )}

        {/* Audio level meter */}
        {mediaStream && (
          <div className="w-full bg-gray-200 rounded-full h-2.5 mb-4">
            <div
              className="bg-green-600 h-2.5 rounded-full transition-all duration-100"
              style={{ width: `${Math.min(audioLevel * 2, 100)}%` }}
            ></div>
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
          <div className="mt-2">
            <label className="flex items-center space-x-2 cursor-pointer">
              <input
                type="checkbox"
                checked={audioFeedback}
                onChange={toggleAudioFeedback}
                className="form-checkbox h-5 w-5 text-blue-600"
              />
              <span>Hear my voice (audio feedback)</span>
            </label>
          </div>
        )}

        {audioFeedback && (
          <div className="text-sm text-gray-600 mt-1">
            ⚠️ You may need to lower your volume to prevent audio feedback loop
          </div>
        )}
      </div>
    </div>
  )
}

export default WebRTCClient

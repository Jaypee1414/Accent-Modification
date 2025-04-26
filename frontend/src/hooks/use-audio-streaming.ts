"use client"

import type React from "react"
import { useRef, useState, useEffect } from "react"

export default function useAudioStreaming() {
  const [isStreaming, setIsStreaming] = useState(false)
  const [audioLevel, setAudioLevel] = useState(0)
  const [connectionStatus, setConnectionStatus] = useState("disconnected")
  const [isMuted, setIsMuted] = useState(false)
  const [gainLevel, setGainLevel] = useState(2.0) // Increased default gain
  const [connectionAttempts, setConnectionAttempts] = useState(0)
  const [hasReceivedAnswer, setHasReceivedAnswer] = useState(false)

  const pcRef = useRef<RTCPeerConnection | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const gainNodeRef = useRef<GainNode | null>(null)
  const dataArrayRef = useRef<Uint8Array | null>(null)
  const animationFrameRef = useRef<number | null>(null)
  const connectionTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    return () => stopStreaming()
  }, [])

  useEffect(() => {
    if (isStreaming && analyserRef.current && dataArrayRef.current) {
      const updateAudioLevel = () => {
        if (!analyserRef.current || !dataArrayRef.current) return

        analyserRef.current.getByteFrequencyData(dataArrayRef.current)
        const avg = dataArrayRef.current.reduce((a, b) => a + b, 0) / dataArrayRef.current.length
        setAudioLevel(avg / 255)

        animationFrameRef.current = requestAnimationFrame(updateAudioLevel)
      }
      animationFrameRef.current = requestAnimationFrame(updateAudioLevel)

      return () => {
        if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [isStreaming])

  useEffect(() => {
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = isMuted ? 0 : gainLevel
    }
  }, [gainLevel, isMuted])

  // Add connection timeout effect
  useEffect(() => {
    if (connectionStatus === "connecting" && !hasReceivedAnswer) {
      // Set a timeout to retry or fail if connection takes too long
      connectionTimeoutRef.current = setTimeout(() => {
        console.log("Connection timeout - retrying or failing")
        if (connectionAttempts < 2) {
          // Retry connection
          stopStreaming()
          setTimeout(() => {
            setConnectionAttempts((prev) => prev + 1)
            handleStartStreaming()
          }, 1000)
        } else {
          // Give up after 3 attempts
          console.error("Failed to establish connection after multiple attempts")
          setConnectionStatus("error")
          stopStreaming()
          setConnectionAttempts(0)
        }
      }, 10000) // 10 second timeout

      return () => {
        if (connectionTimeoutRef.current) {
          clearTimeout(connectionTimeoutRef.current)
          connectionTimeoutRef.current = null
        }
      }
    }
  }, [connectionStatus, hasReceivedAnswer, connectionAttempts])

  const handleStartStreaming = async () => {
    try {
      // Reset connection state
      setConnectionStatus("connecting")
      setHasReceivedAnswer(false)

      console.log("Starting WebSocket connection...")
      const ws = new WebSocket("ws://localhost:3001")
      wsRef.current = ws

      // Create WebRTC peer connection with improved ICE servers
      const pc = new RTCPeerConnection({
        iceServers: [
          { urls: "stun:stun.l.google.com:19302" },
          { urls: "stun:stun1.l.google.com:19302" },
          { urls: "stun:stun2.l.google.com:19302" },
        ],
        iceCandidatePoolSize: 10,
      })
      pcRef.current = pc

      // Add connection debugging
      pc.onicegatheringstatechange = () => {
        console.log("ICE gathering state:", pc.iceGatheringState)
      }

      pc.onicecandidateerror = (event) => {
        console.error("ICE candidate error:", event)
      }

      // Request high-quality audio with specific constraints
      console.log("Requesting microphone access...")
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
          sampleRate: 48000,
        },
      })
      streamRef.current = stream
      console.log("Microphone access granted")

      // Create high-quality audio context
      const audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 48000 })
      audioContextRef.current = audioContext

      const source = audioContext.createMediaStreamSource(stream)

      // Create a high-pass filter to remove low-frequency noise
      const highPassFilter = audioContext.createBiquadFilter()
      highPassFilter.type = "highpass"
      highPassFilter.frequency.value = 80 // Cut frequencies below 80Hz

      // Create a low-pass filter to smooth out high frequencies
      const lowPassFilter = audioContext.createBiquadFilter()
      lowPassFilter.type = "lowpass"
      lowPassFilter.frequency.value = 15000 // Allow frequencies up to 15kHz

      // Enhanced compressor for better dynamic range
      const compressor = audioContext.createDynamicsCompressor()
      compressor.threshold.value = -24
      compressor.knee.value = 6
      compressor.ratio.value = 4
      compressor.attack.value = 0.003
      compressor.release.value = 0.25

      // Create a gain node with higher gain
      const gainNode = audioContext.createGain()
      gainNode.gain.value = gainLevel
      gainNodeRef.current = gainNode

      // Create an analyzer for visualizing audio levels
      const analyser = audioContext.createAnalyser()
      analyser.fftSize = 1024 // Higher FFT size for better analysis
      analyserRef.current = analyser

      // Connect the audio processing chain:
      // Source → HighPass → LowPass → Compressor → Gain → Analyser
      source.connect(highPassFilter)
      highPassFilter.connect(lowPassFilter)
      lowPassFilter.connect(compressor)
      compressor.connect(gainNode)
      gainNode.connect(analyser)

      // Create a destination for WebRTC
      const destination = audioContext.createMediaStreamDestination()
      gainNode.connect(destination)
      const processedStream = destination.stream

      // Add the processed audio track to the peer connection
      processedStream.getTracks().forEach((track) => {
        console.log("Adding processed track:", track.kind)
        pc.addTrack(track, processedStream)
      })

      // Set up analyzer data array
      const bufferLength = analyser.frequencyBinCount
      const dataArray = new Uint8Array(bufferLength)
      dataArrayRef.current = dataArray

      // Handle ICE candidates
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          console.log("Sending ICE candidate to server")
          ws.send(JSON.stringify({ type: "ice-candidate", candidate: event.candidate }))
        } else {
          console.log("All ICE candidates gathered")
        }
      }

      // Monitor connection state
      pc.onconnectionstatechange = () => {
        console.log("WebRTC connection state:", pc.connectionState)
        setConnectionStatus(pc.connectionState)

        if (pc.connectionState === "connected") {
          setIsStreaming(true)
          setConnectionAttempts(0) // Reset attempts on successful connection
        } else if (["disconnected", "failed", "closed"].includes(pc.connectionState)) {
          stopStreaming()
        }
      }

      // Handle WebSocket connection
      ws.onopen = async () => {
        console.log("WebSocket connected, creating offer...")

        try {
          // Create offer with high-quality audio settings
          const offerOptions = {
            offerToReceiveAudio: false, // We don't need to receive audio
            offerToReceiveVideo: false,
            voiceActivityDetection: false,
          }

          const offer = await pc.createOffer(offerOptions)
          console.log("Offer created")

          // Modify SDP to force high-quality audio
          if (offer.sdp) {
            let sdp = offer.sdp

            // Set Opus codec with high quality parameters
            sdp = sdp.replace(
              /a=rtpmap:(\d+) opus\/48000\/2/g,
              "a=rtpmap:$1 opus/48000/2\r\n" +
                "a=fmtp:$1 minptime=10;useinbandfec=1;stereo=0;sprop-stereo=0;cbr=1;maxaveragebitrate=128000;maxplaybackrate=48000;ptime=20;maxptime=40",
            )

            offer.sdp = sdp
          }

          await pc.setLocalDescription(offer)
          console.log("Local description set, sending offer to server")
          ws.send(JSON.stringify({ type: "offer", offer }))

          // Send a heartbeat to keep the connection alive
          const heartbeatInterval = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: "heartbeat" }))
            } else {
              clearInterval(heartbeatInterval)
            }
          }, 5000)
        } catch (error) {
          console.error("Error creating or sending offer:", error)
          setConnectionStatus("error")
          stopStreaming()
        }
      }

      // Handle WebSocket messages
      ws.onmessage = async (event) => {
        try {
          const data = JSON.parse(event.data)
          console.log("Received message type:", data.type)

          if (data.type === "answer") {
            console.log("Received answer from server")
            setHasReceivedAnswer(true)
            await pc.setRemoteDescription(new RTCSessionDescription(data.answer))
            console.log("Remote description set")
          } else if (data.type === "ice-candidate") {
            console.log("Received ICE candidate from server")
            await pc.addIceCandidate(new RTCIceCandidate(data.candidate))
          } else if (data.type === "audio_metrics") {
            // Handle metrics response
            console.log("Received audio metrics from server:", data.metrics)
          } else if (data.type === "heartbeat_ack") {
            // Heartbeat acknowledgment
            console.log("Heartbeat acknowledged")
          }
        } catch (error) {
          console.error("Error handling WebSocket message:", error)
        }
      }

      // Handle WebSocket errors
      ws.onerror = (error) => {
        console.error("WebSocket error:", error)
        setConnectionStatus("error")
        stopStreaming()
      }

      // Handle WebSocket closure
      ws.onclose = () => {
        console.log("WebSocket closed")
        if (connectionStatus !== "error") setConnectionStatus("disconnected")
        stopStreaming()
      }

      // Send periodic metrics
      const metricsInterval = setInterval(() => {
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(
            JSON.stringify({
              type: "client_audio_metrics",
              metrics: {
                timestamp: Date.now(),
                audioLevel,
                gainLevel,
                isMuted,
              },
            }),
          )
        }
      }, 2000)

      return () => clearInterval(metricsInterval)
    } catch (error) {
      console.error("Error starting stream:", error)
      setConnectionStatus("error")
      stopStreaming()
    }
  }

  const stopStreaming = () => {
    console.log("Stopping streaming...")

    // Clear connection timeout if it exists
    if (connectionTimeoutRef.current) {
      clearTimeout(connectionTimeoutRef.current)
      connectionTimeoutRef.current = null
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        track.stop()
        console.log("Audio track stopped")
      })
      streamRef.current = null
    }

    if (pcRef.current) {
      pcRef.current.close()
      pcRef.current = null
      console.log("WebRTC connection closed")
    }

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.close()
      wsRef.current = null
      console.log("WebSocket connection closed")
    }

    if (audioContextRef.current) {
      audioContextRef.current.close().catch((err) => console.error("Error closing audio context:", err))
      audioContextRef.current = null
      analyserRef.current = null
      gainNodeRef.current = null
      dataArrayRef.current = null
      console.log("Audio context closed")
    }

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
    }

    setIsStreaming(false)
    setHasReceivedAnswer(false)
    if (connectionStatus !== "error") setConnectionStatus("disconnected")
  }

  const toggleMute = () => {
    setIsMuted(!isMuted)
  }

  const handleGainChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = Number.parseFloat(e.target.value)
    setGainLevel(value)
  }

  return {
    handleGainChange,
    toggleMute,
    stopStreaming,
    handleStartStreaming,
    connectionStatus,
    isStreaming,
    audioLevel,
    isMuted,
    gainLevel,
  }
}

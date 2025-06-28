"use client"

import type React from "react"
import { useRef, useState, useEffect } from "react"

export default function useAudioStreaming() {
  const [isStreaming, setIsStreaming] = useState(false)
  const [audioLevel, setAudioLevel] = useState(0)
  const [connectionStatus, setConnectionStatus] = useState("disconnected")
  const [isMuted, setIsMuted] = useState(false)
  const [gainLevel, setGainLevel] = useState(2.0) // Increased default gain

  const pcRef = useRef<RTCPeerConnection | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const gainNodeRef = useRef<GainNode | null>(null)
  const dataArrayRef = useRef<Uint8Array | null>(null)
  const animationFrameRef = useRef<number | null>(null)

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

  const waitForSocketOpen = (socket: WebSocket): Promise<void> => {
    return new Promise((resolve, reject) => {
      if (socket.readyState === WebSocket.OPEN) {
        resolve()
      } else {
        const handleOpen = () => {
          cleanup()
          resolve()
        }
        const handleError = (err: Event) => {
          cleanup()
          reject(err)
        }
        const cleanup = () => {
          socket.removeEventListener("open", handleOpen)
          socket.removeEventListener("error", handleError)
        }
        socket.addEventListener("open", handleOpen)
        socket.addEventListener("error", handleError)
      }
    })
  }
  
  const handleStartStreaming = async () => {
    setConnectionStatus("connecting")
    const ws = new WebSocket("ws://localhost:3001")
    wsRef.current = ws
    try {
      await waitForSocketOpen(ws)

      // Create WebRTC peer connection with improved ICE servers
      const pc = new RTCPeerConnection({
        iceServers: [
          { urls: "stun:stun.l.google.com:19302" },
          { urls: "stun:stun1.l.google.com:19302" },
          { urls: "stun:stun2.l.google.com:19302" },
        ],
      })
      pcRef.current = pc

      // Request high-quality audio with specific constraints
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
          sampleRate: 48000,
          sampleSize: 24,
          // Higher bitrate for better quality
          // googHighpassFilter: true,
          
          // // Prioritize audio quality
          // googAudioMirroring: false,
          // googDucking: false,
          // googEchoCancellation: true,
          // googEchoCancellation2: true,
          // googAutoGainControl: true,
          // googAutoGainControl2: true,
          // googNoiseSuppression: true,
          // googNoiseSuppression2: true,
          // googTypingNoiseDetection: true,
          // googExperimentalEchoCancellation: true,
          // googExperimentalNoiseSuppression: true,
          // googExperimentalAutoGainControl: true,
        },
      })
      streamRef.current = stream

      // Create high-quality audio context
      const audioContext = new AudioContext({ sampleRate: 48000 })
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
          ws.send(JSON.stringify({ type: "ice-candidate", candidate: event.candidate }))
        }
      }

      // Monitor connection state
      pc.onconnectionstatechange = () => {
        console.log("WebRTC connection state:", pc.connectionState)
        setConnectionStatus(pc.connectionState)

        if (pc.connectionState === "connected") {
          setIsStreaming(true)
        } else if (["disconnected", "failed", "closed"].includes(pc.connectionState)) {
          stopStreaming()
        }
      }

      // Handle WebSocket connection
        // Create offer with high-quality audio settings
        const offerOptions = {
          offerToReceiveAudio: true,
          offerToReceiveVideo: false,
          voiceActivityDetection: false,
        }

        const offer = await pc.createOffer(offerOptions)

        // Modify SDP to force high-quality audio
        if (offer.sdp) {
          let sdp = offer.sdp

          // Set Opus codec with high quality parameters
          sdp = sdp.replace(
            /a=rtpmap:(\d+) opus\/48000\/2/g,
            "a=rtpmap:$1 opus/48000/2\r\n" +
              "a=fmtp:$1 minptime=10;useinbandfec=1;stereo=0;sprop-stereo=0;cbr=1;maxaveragebitrate=510000;maxplaybackrate=48000;ptime=20;maxptime=40",
          )

          // Ensure audio level indication is enabled
          if (!sdp.includes("a=extmap:1 urn:ietf:params:rtp-hdrext:ssrc-audio-level")) {
            sdp = sdp.replace(
              /a=rtpmap:(\d+) opus\/48000\/2/g,
              "a=rtpmap:$1 opus/48000/2\r\na=extmap:1 urn:ietf:params:rtp-hdrext:ssrc-audio-level",
            )
          }

          offer.sdp = sdp
        }

        await pc.setLocalDescription(offer)
        ws.send(JSON.stringify({ type: "offer", offer }))

      // Handle WebSocket messages
      ws.onmessage = async (event) => {
        const data = JSON.parse(event.data)
        if (data.type === "answer") {
          await pc.setRemoteDescription(new RTCSessionDescription(data.answer))
        } else if (data.type === "ice-candidate") {
          await pc.addIceCandidate(new RTCIceCandidate(data.candidate))
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
        if (ws.readyState === WebSocket.OPEN) {
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
      // console.error("Error starting stream:", error)
      console.error("Error starting stream:", JSON.stringify(error, Object.getOwnPropertyNames(error)))

      setConnectionStatus("error")
      stopStreaming()
    }
  }

  const stopStreaming = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }

    if (pcRef.current) {
      pcRef.current.close()
      pcRef.current = null
    }

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.close()
      wsRef.current = null
    }

    if (audioContextRef.current) {
      audioContextRef.current.close()
      audioContextRef.current = null
      analyserRef.current = null
      gainNodeRef.current = null
      dataArrayRef.current = null
    }

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
    }

    setIsStreaming(false)
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

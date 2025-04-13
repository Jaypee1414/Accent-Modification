// "use client"
// // frontend/components/WebRTCClient.tsx
// import { useEffect, useState } from "react"

// // Define the types for the WebSocket message
// interface SignalingMessage {
//   type: "offer" | "answer" | "candidate"
//   offer?: RTCSessionDescriptionInit
//   answer?: RTCSessionDescriptionInit
//   candidate?: RTCIceCandidateInit
// }

// const WebRTCClient = () => {
//   const [peerConnection, setPeerConnection] = useState<RTCPeerConnection | null>(null)
//   const [ws, setWs] = useState<WebSocket | null>(null)
//   const [isListening, setIsListening] = useState(false)
//   const [mediaStream, setMediaStream] = useState<MediaStream | null>(null)

//   // Handle signaling messages from the WebSocket server
//   const handleSignalingMessage = async (data: SignalingMessage) => {
//     if (!peerConnection) return

//     switch (data.type) {
//       case "offer":
//         await handleOffer(data.offer)
//         break
//       case "answer":
//         if (data.answer) {
//           await peerConnection.setRemoteDescription(data.answer)
//         }
//         break
//       case "candidate":
//         if (data.candidate) {
//           const candidate = new RTCIceCandidate(data.candidate)
//           await peerConnection.addIceCandidate(candidate)
//         }
//         break
//       default:
//         break
//     }
//   }

//   // Handle offer
//   const handleOffer = async (offer: RTCSessionDescriptionInit | undefined) => {
//     if (!offer || !peerConnection) return

//     try {
//       await peerConnection.setRemoteDescription(new RTCSessionDescription(offer))
//       const answer = await peerConnection.createAnswer()
//       await peerConnection.setLocalDescription(answer)

//       // Send the answer to the backend
//       ws?.send(JSON.stringify({ type: "answer", answer }))
//     } catch (error) {
//       console.error("Error handling offer:", error)
//     }
//   }

//   // Get user media (microphone)
//   const getUserMedia = async () => {
//     try {
//       const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
//       setMediaStream(stream)
//       return stream
//     } catch (error) {
//       console.error("Error accessing microphone:", error)
//       return null
//     }
//   }

//   // Create the peer connection when the component mounts
//   const createPeerConnection = async () => {
//     const stream = await getUserMedia()
//     if (!stream) return null

//     const peer = new RTCPeerConnection({
//       iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
//     })

//     // Add audio tracks to the peer connection
//     stream.getAudioTracks().forEach((track) => {
//       peer.addTrack(track, stream)
//     })

//     peer.onicecandidate = (event) => {
//       if (event.candidate) {
//         ws?.send(JSON.stringify({ type: "candidate", candidate: event.candidate }))
//       }
//     }

//     peer.ontrack = (event) => {
//       const [track] = event.streams[0].getAudioTracks()
//       console.log("Received audio track:", track.kind)
//       // You can pipe this to your AI/ML model here if needed
//     }

//     // Set up audio level detection to show when actively listening
//     const audioContext = new AudioContext()
//     const source = audioContext.createMediaStreamSource(stream)
//     const analyser = audioContext.createAnalyser()
//     analyser.fftSize = 256
//     source.connect(analyser)

//     const bufferLength = analyser.frequencyBinCount
//     const dataArray = new Uint8Array(bufferLength)

//     const checkAudioLevel = () => {
//       analyser.getByteFrequencyData(dataArray)

//       // Calculate average volume level
//       let sum = 0
//       for (let i = 0; i < bufferLength; i++) {
//         sum += dataArray[i]
//       }
//       const average = sum / bufferLength

//       // Set listening state based on volume threshold
//       setIsListening(average > 10) // Adjust threshold as needed

//       // Continue checking audio levels
//       requestAnimationFrame(checkAudioLevel)
//     }

//     checkAudioLevel()

//     setPeerConnection(peer)
//     return peer
//   }

//   // Start communication by creating an offer
//   const startCommunication = async () => {
//     const peer = peerConnection || (await createPeerConnection())
//     if (!peer) return

//     try {
//       const offer = await peer.createOffer()
//       await peer.setLocalDescription(offer)

//       // Send the offer to the backend
//       ws?.send(JSON.stringify({ type: "offer", offer }))
//     } catch (error) {
//       console.error("Error creating offer:", error)
//     }
//   }

//   // Stop communication and release resources
//   const stopCommunication = () => {
//     if (mediaStream) {
//       mediaStream.getTracks().forEach((track) => track.stop())
//       setMediaStream(null)
//     }

//     if (peerConnection) {
//       peerConnection.close()
//       setPeerConnection(null)
//     }

//     setIsListening(false)
//   }

//   useEffect(() => {
//     const socket = new WebSocket("ws://localhost:3001") // Fastify WebSocket server URL
//     setWs(socket)

//     socket.onopen = () => {
//       console.log("WebSocket connected!")
//     }

//     socket.onmessage = (event) => {
//       const data: SignalingMessage = JSON.parse(event.data)
//       handleSignalingMessage(data)
//     }

//     socket.onerror = (error) => {
//       console.error("WebSocket error:", error)
//     }

//     socket.onclose = () => {
//       console.log("WebSocket connection closed.")
//       stopCommunication()
//     }

//     return () => {
//       socket.close()
//       stopCommunication()
//     }
//   }, [])

//   return (
//     <div className="p-6 max-w-md mx-auto">
//       <div className="flex flex-col items-center gap-4">
//         <div className="text-xl font-bold">WebRTC Audio Communication</div>

//         {isListening && (
//           <div className="bg-green-100 text-green-800 px-4 py-2 rounded-full animate-pulse flex items-center">
//             <div className="w-3 h-3 bg-green-500 rounded-full mr-2"></div>
//             Listening...
//           </div>
//         )}

//         <div className="flex gap-4">
//           <button onClick={startCommunication} className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded">
//             Start Communication
//           </button>

//           <button onClick={stopCommunication} className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded">
//             Stop
//           </button>
//         </div>
//       </div>
//     </div>
//   )
// }

// export default WebRTCClient
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
  const audioRef = useRef<HTMLAudioElement>(null)

  // Handle signaling messages from the WebSocket server
  const handleSignalingMessage = async (data: SignalingMessage) => {
    if (!peerConnection) return

    switch (data.type) {
      case "offer":
        await handleOffer(data.offer)
        break
      case "answer":
        if (data.answer) {
          await peerConnection.setRemoteDescription(data.answer)
        }
        break
      case "candidate":
        if (data.candidate) {
          const candidate = new RTCIceCandidate(data.candidate)
          await peerConnection.addIceCandidate(candidate)
        }
        break
      default:
        break
    }
  }

  // Handle offer
  const handleOffer = async (offer: RTCSessionDescriptionInit | undefined) => {
    if (!offer || !peerConnection) return

    try {
      await peerConnection.setRemoteDescription(new RTCSessionDescription(offer))
      const answer = await peerConnection.createAnswer()
      await peerConnection.setLocalDescription(answer)

      // Send the answer to the backend
      ws?.send(JSON.stringify({ type: "answer", answer }))
    } catch (error) {
      console.error("Error handling offer:", error)
    }
  }

  // Get user media (microphone)
  const getUserMedia = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
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

  // Create the peer connection when the component mounts
  const createPeerConnection = async () => {
    const stream = await getUserMedia()
    if (!stream) return null

    const peer = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    })

    // Add audio tracks to the peer connection
    stream.getAudioTracks().forEach((track) => {
      peer.addTrack(track, stream)
    })

    peer.onicecandidate = (event) => {
      if (event.candidate) {
        ws?.send(JSON.stringify({ type: "candidate", candidate: event.candidate }))
      }
    }

    peer.ontrack = (event) => {
      const [track] = event.streams[0].getAudioTracks()
      console.log("Received audio track:", track.kind)
      
      // Play the incoming audio track through an audio element
      const audioElement = new Audio()
      const audioStream = new MediaStream()
      audioStream.addTrack(track)
      audioElement.srcObject = audioStream
      audioElement.play().catch((err) => console.error("Error playing received audio:", err))
    }

    // Set up audio level detection to show when actively listening
    const audioContext = new AudioContext()
    const source = audioContext.createMediaStreamSource(stream)
    const analyser = audioContext.createAnalyser()
    analyser.fftSize = 256
    source.connect(analyser)

    const bufferLength = analyser.frequencyBinCount
    const dataArray = new Uint8Array(bufferLength)

    const checkAudioLevel = () => {
      analyser.getByteFrequencyData(dataArray)

      //note Calculate average volume level
      let sum = 0
      for (let i = 0; i < bufferLength; i++) {
        console.log("success")
        sum += dataArray[i]
      }
      const average = sum / bufferLength

      //note Set listening state based on volume threshold
      setIsListening(average > 10) //note Adjust threshold as needed

      //note Continue checking audio levels
      requestAnimationFrame(checkAudioLevel)
    }

    checkAudioLevel()

    setPeerConnection(peer)
    return peer
  }

  //note Start communication by creating an offer
  const startCommunication = async () => {
    const peer = peerConnection || (await createPeerConnection())
    if (!peer) return

    try {
      const offer = await peer.createOffer()
      await peer.setLocalDescription(offer)

      //note Send the offer to the backend
      ws?.send(JSON.stringify({ type: "offer", offer }))
    } catch (error) {
      console.error("Error creating offer:", error)
    }
  }

  //note Stop communication and release resources
  const stopCommunication = () => {
    if (mediaStream) {
      mediaStream.getTracks().forEach((track) => track.stop())
      setMediaStream(null)
    }

    if (peerConnection) {
      peerConnection.close()
      setPeerConnection(null)
    }

    setIsListening(false)
    setAudioFeedback(false)
  }

  useEffect(() => {
    const socket = new WebSocket("ws://localhost:3001") 
    setWs(socket)

    socket.onopen = () => {
      console.log("WebSocket connected!")
    }

    socket.onmessage = (event) => {
      const data: SignalingMessage = JSON.parse(event.data)
      handleSignalingMessage(data)
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

        {isListening && (
          <div className="bg-green-100 text-green-800 px-4 py-2 rounded-full animate-pulse flex items-center">
            <div className="w-3 h-3 bg-green-500 rounded-full mr-2"></div>
            Listening...
          </div>
        )}

        {/* Hidden audio element for feedback */}
        <audio ref={audioRef} className="hidden" />

        <div className="flex gap-4">
          <button onClick={startCommunication} className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded">
            Start Communication
          </button>

          <button onClick={stopCommunication} className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded">
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

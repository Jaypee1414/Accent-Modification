import asyncio
import websockets
import numpy as np
import whisper
import tempfile
import wave
import os

# Load Whisper model once at the beginning
model = whisper.load_model("base")  # Change to "small", "medium", etc., if needed

async def handler(websocket):
    print("Connected to client")

    # Accumulate audio data
    buffer = bytearray()
    sample_rate = 48000  # Expected sample rate from WebRTC

    try:
        async for message in websocket:
            buffer.extend(message)

            # Process every ~5 seconds of audio
            if len(buffer) > sample_rate * 2 * 5:  # 5 seconds * 2 bytes per sample
                with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp_wav:
                    tmp_path = tmp_wav.name  # Save path before closing

                # Write to WAV file after file handle is released
                with wave.open(tmp_path, 'wb') as wf:
                    wf.setnchannels(1)
                    wf.setsampwidth(2)  # 16-bit
                    wf.setframerate(sample_rate)
                    wf.writeframes(buffer)

                buffer.clear()

                try:
                    print("🔍 Transcribing...")
                    result = model.transcribe(tmp_path)
                    transcription = result["text"]
                    print("📝 Transcription:", transcription)

                    await websocket.send(transcription)
                except Exception as transcribe_error:
                    print("Transcription failed:", transcribe_error)
                finally:
                    os.remove(tmp_path)  # Ensure file is cleaned up

    except Exception as e:
        print(f"Error: {e}")

async def main():
    async with websockets.serve(handler, "localhost", 8765):
        print("WebSocket server running on ws://localhost:8765")
        await asyncio.Future()

asyncio.run(main())

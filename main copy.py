import asyncio
import websockets
import numpy as np
import tempfile
import wave
import os
import requests
import threading
import sounddevice as sd
import soundfile as sf
import librosa
import noisereduce as nr
from dotenv import load_dotenv
from faster_whisper import WhisperModel

# Load environment variables
load_dotenv()
ELEVENLABS_API_KEY = os.getenv("ELEVENLABS_API_KEY")
VOICE_ID = os.getenv("ELEVENLABS_VOICE_ID")

# Load STT model (tiny is faster + better for short clips)
whisper_model = WhisperModel("tiny.en", device="cpu", compute_type="int8")

sample_rate = 48000
MIN_TEXT_LENGTH = 5  # Minimum length to send to TTS

def elevenlabs_tts(text, output_path="tts_output.wav"):
    if not text.strip() or len(text.strip()) < MIN_TEXT_LENGTH:
        print("🛑 Ignored short/empty text:", text)
        return

    print("🎤 Sending text to ElevenLabs:", text)
    url = f"https://api.elevenlabs.io/v1/text-to-speech/{VOICE_ID}"
    headers = {
        "xi-api-key": ELEVENLABS_API_KEY,
        "Content-Type": "application/json"
    }
    payload = {
        "text": text,
        "model_id": "eleven_monolingual_v1",
        "voice_settings": {
            "stability": 0.4,
            "similarity_boost": 0.75
        }
    }

    try:
        response = requests.post(url, headers=headers, json=payload, stream=True)
        if response.status_code == 200:
            with open(output_path, "wb") as f:
                for chunk in response.iter_content(chunk_size=1024):
                    if chunk:
                        f.write(chunk)
            print("🔊 TTS saved:", output_path)

            def play_audio():
                try:
                    data, sr = sf.read(output_path, dtype="float32")
                    sd.play(data, sr)
                    sd.wait()
                finally:
                    try:
                        os.remove(output_path)
                    except Exception as e:
                        print("⚠️ Failed to remove:", e)

            threading.Thread(target=play_audio).start()
        else:
            print("❌ ElevenLabs API error:", response.text)
    except Exception as e:
        print("❌ ElevenLabs request failed:", e)

def post_process_audio(path):
    print("🧽 Reducing noise + trimming silence...")
    try:
        data, rate = sf.read(path)
        trimmed, _ = librosa.effects.trim(data, top_db=30)
        reduced = nr.reduce_noise(y=trimmed, sr=rate)
        normalized = librosa.util.normalize(reduced)
        sf.write(path, normalized, rate)
    except Exception as e:
        print("⚠️ Post-process failed:", e)

async def handler(websocket):
    print("🔌 Client connected")
    buffer = bytearray()

    try:
        async for message in websocket:
            buffer.extend(message)
            if len(buffer) > sample_rate * 2 * 3:  # 3 seconds max buffer
                with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp_wav:
                    tmp_path = tmp_wav.name
                with wave.open(tmp_path, 'wb') as wf:
                    wf.setnchannels(1)
                    wf.setsampwidth(2)
                    wf.setframerate(sample_rate)
                    wf.writeframes(buffer)

                buffer.clear()

                post_process_audio(tmp_path)

                print("🔍 Transcribing...")
                try:
                    segments, info = whisper_model.transcribe(tmp_path)
                    text = " ".join([seg.text.strip() for seg in segments if seg.text.strip()])
                    text = text.strip()
                    print("📝 Transcription:", text)

                    if text and len(text) >= MIN_TEXT_LENGTH:
                        await websocket.send(text)
                        elevenlabs_tts(text)
                except Exception as e:
                    print("❌ Transcription error:", e)
                finally:
                    os.remove(tmp_path)

    except websockets.exceptions.ConnectionClosedError as e:
        print("⚠️ WebSocket closed:", e)
    except Exception as e:
        print(f"❌ Unexpected error: {e}")

async def main():
    async with websockets.serve(handler, "localhost", 8765, ping_timeout=None):
        print("🚀 WebSocket server running at ws://localhost:8765")
        await asyncio.Future()

asyncio.run(main())

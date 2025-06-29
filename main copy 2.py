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
from datetime import datetime
from dotenv import load_dotenv
from faster_whisper import WhisperModel

# Load environment variables
load_dotenv()
ELEVENLABS_API_KEY = os.getenv("ELEVENLABS_API_KEY")
VOICE_ID = os.getenv("ELEVENLABS_VOICE_ID")

# Load STT model (tiny is faster + better for short clips)
whisper_model = WhisperModel("tiny.en", device="cpu", compute_type="int8")

sample_rate = 48000
MIN_TEXT_LENGTH = 5    # Minimum length to send to TTS
BUFFER_SECONDS = 1     # Buffer length in seconds for “near” real-time

TRANSCRIPT_FILE = "transcript.txt"

def append_transcript(text: str):
    ts = datetime.now().isoformat(sep=' ', timespec='seconds')
    with open(TRANSCRIPT_FILE, "a", encoding="utf-8") as f:
        f.write(f"[{ts}] {text}\n")

def play_tts_stream(output_path):
    """Read the file once written and play it, then delete."""
    try:
        data, sr = sf.read(output_path, dtype="float32")
        sd.play(data, sr)
        sd.wait()
    finally:
        try:
            os.remove(output_path)
        except Exception as e:
            print("⚠️ Failed to remove TTS temp file:", e)

def elevenlabs_tts_async(text: str):
    """Send to ElevenLabs TTS and play in background."""
    if len(text.strip()) < MIN_TEXT_LENGTH:
        return

    print("🎤 Requesting TTS for:", text)
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
        if response.status_code != 200:
            print("❌ ElevenLabs API error:", response.text)
            return

        # write to tmp file
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
            for chunk in response.iter_content(chunk_size=1024):
                if chunk:
                    tmp.write(chunk)
            temp_path = tmp.name

        # play in thread
        threading.Thread(target=play_tts_stream, args=(temp_path,), daemon=True).start()
    except Exception as e:
        print("❌ ElevenLabs request failed:", e)

def post_process_audio(path):
    print("🧼 Post-processing audio...")
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
    frames_required = sample_rate * 2 * BUFFER_SECONDS  # bytes (2 bytes per sample)

    try:
        async for message in websocket:
            buffer.extend(message)

            # Once we have enough audio, process it
            if len(buffer) >= frames_required:
                # dump to wav
                with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
                    tmp_path = tmp.name
                with wave.open(tmp_path, 'wb') as wf:
                    wf.setnchannels(1)
                    wf.setsampwidth(2)
                    wf.setframerate(sample_rate)
                    wf.writeframes(buffer)

                buffer.clear()

                # clean up noise/silence
                post_process_audio(tmp_path)

                print("🔍 Transcribing chunk...")
                try:
                    segments, _ = whisper_model.transcribe(tmp_path)
                    text = " ".join(seg.text.strip() for seg in segments if seg.text.strip()).strip()
                    print("📝 Transcription:", text)

                    if text and len(text) >= MIN_TEXT_LENGTH:
                        # send back to client
                        await websocket.send(text)

                        # append to transcript.txt
                        append_transcript(text)

                        # trigger async TTS & playback
                        # no await so it’s non-blocking
                        asyncio.get_event_loop().call_soon(elevenlabs_tts_async, text)
                except Exception as e:
                    print("❌ Transcription error:", e)
                finally:
                    os.remove(tmp_path)

    except websockets.exceptions.ConnectionClosedError as e:
        print("⚠️ WebSocket closed:", e)
    except Exception as e:
        print("❌ Unexpected error:", e)

async def main():
    server = await websockets.serve(handler, "localhost", 8765, ping_timeout=None)
    print("🚀 Server running at ws://localhost:8765")
    await server.wait_closed()

if __name__ == "__main__":
    asyncio.run(main())

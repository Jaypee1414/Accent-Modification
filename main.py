import asyncio
import websockets
import numpy as np   # <-- Add this!

async def handler(websocket):
    try:
        print("Connected to client")
        async for message in websocket:
            samples = np.frombuffer(message, dtype=np.int16)
            print(f"Received raw data of {len(message)} bytes")
            print(f"Decoded {len(samples)} samples:", samples[:10])

    except Exception as e:
        print(f"Error: {e}")

async def main():
    async with websockets.serve(handler, "localhost", 8765):
        print("WebSocket server running on ws://localhost:8765")
        await asyncio.Future()

asyncio.run(main())

"use client";

import type React from "react";
import { Mic, MicOff, VolumeX } from "lucide-react";
import useAudioStreaming from "@/hooks/useAudioStreaming";

const EnhancedAudioStreamer = () => {
  const {
    handleGainChange,
    toggleMute,
    stopStreaming,
    handleStartStreaming,
    connectionStatus,
    isStreaming,
    audioLevel,
    isMuted,
    gainLevel,
  } = useAudioStreaming();

  return (
    <div className="p-6 max-w-md mx-auto bg-white rounded-xl shadow-md">
      <h2 className="text-xl font-bold mb-4">Enhanced Audio Streamer</h2>

      <div className="mb-4">
        <div className="text-sm text-gray-500 mb-1">Connection Status</div>
        <div
          className={`text-sm font-medium ${
            connectionStatus === "connected"
              ? "text-green-600"
              : connectionStatus === "connecting"
              ? "text-yellow-600"
              : connectionStatus === "error"
              ? "text-red-600"
              : "text-gray-600"
          }`}
        >
          {connectionStatus.charAt(0).toUpperCase() + connectionStatus.slice(1)}
        </div>
      </div>

      {isStreaming && (
        <>
          <div className="mb-4">
            <div className="text-sm text-gray-500 mb-1">Audio Level</div>
            <div className="w-full bg-gray-200 rounded-full h-2.5">
              <div
                className={`h-2.5 rounded-full ${
                  isMuted ? "bg-gray-400" : "bg-blue-600"
                }`}
                style={{ width: `${audioLevel * 100}%` }}
              ></div>
            </div>
          </div>

          <div className="mb-4">
            <div className="flex justify-between">
              <div className="text-sm text-gray-500">Gain Level</div>
              <div className="text-sm font-medium">{gainLevel.toFixed(1)}x</div>
            </div>
            <input
              type="range"
              min="0.5"
              max="5.0" // Increased max gain
              step="0.1"
              value={gainLevel}
              onChange={handleGainChange}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
            />
          </div>
        </>
      )}

      <div className="flex space-x-2">
        {!isStreaming ? (
          <button
            onClick={handleStartStreaming}
            className="flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={connectionStatus === "connecting"}
          >
            <Mic className="h-4 w-4" />
            {connectionStatus === "connecting"
              ? "Connecting..."
              : "Start Streaming"}
          </button>
        ) : (
          <>
            <button
              onClick={toggleMute}
              className={`flex items-center justify-center gap-2 px-4 py-2 ${
                isMuted
                  ? "bg-yellow-500 hover:bg-yellow-600"
                  : "bg-blue-600 hover:bg-blue-700"
              } text-white rounded-lg`}
            >
              {isMuted ? (
                <VolumeX className="h-4 w-4" />
              ) : (
                <MicOff className="h-4 w-4" />
              )}
              {isMuted ? "Unmute" : "Mute"}
            </button>
            <button
              onClick={stopStreaming}
              className="flex items-center justify-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
            >
              Stop
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default EnhancedAudioStreamer;

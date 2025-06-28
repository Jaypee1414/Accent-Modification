"use client";

import type React from "react";
import { Mic, MicOff, VolumeX } from "lucide-react";
import AvailableAccent from "./components/available-accent";
import useAudioStreaming from "@/hooks/use-audio-streaming";

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
    <>
      <div className="p-10 w-1/2 mx-auto bg-white rounded-xl shadow-md absolute right-1/2 bottom-1/2 transform translate-x-1/2 translate-y-1/2">
        <h2 className="text-xl font-bold mb-4 text-center">
          Choose your accent
        </h2>
        <AvailableAccent start={handleStartStreaming} stop={stopStreaming}/>
        <div className="mb-4">
          <div className="text-sm text-gray-500 mb-1 my-10">Connection Status</div>
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
            {connectionStatus.charAt(0).toUpperCase() +
              connectionStatus.slice(1)}
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
                <div className="text-sm font-medium">
                  {gainLevel.toFixed(1)}x
                </div>
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

        <div className="flex justify-center space-x-2">
          {!isStreaming ? (
            <button
              onClick={handleStartStreaming}
              className="flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 text-center w-full"
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
                className={`flex items-center justify-center gap-2 px-4 py-2 w-full ${
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
            </>
          )}
        </div>
      </div>
    </>
  );
};

export default EnhancedAudioStreamer;

"use client";
import { useEffect, useState, useRef } from "react";
import { io } from "socket.io-client";

export default function SpeechInput() {
  const [input, setInput] = useState("");
  const [currentTranscript, setCurrentTranscript] = useState("");
  const [finalTranscripts, setFinalTranscripts] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const mediaRecorderRef = useRef(null);
  const streamRef = useRef(null);
  const socketRef = useRef(null);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: "audio/webm",
      });
      mediaRecorderRef.current = mediaRecorder;
      console.log("stream", stream);
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0 && isConnected && socketRef.current) {
          console.log("event", event.data);
          socketRef.current.emit("audioChunk", event.data);
        }
      };

      mediaRecorder.onstart = () => {
        setIsRecording(true);
      };

      mediaRecorder.onstop = () => {
        setIsRecording(false);
      };
      
      if (socketRef.current && isConnected) {
        setCurrentTranscript(""); // Clear current transcript for new recording
        setFinalTranscripts(""); // Clear final transcripts for new recording session
        socketRef.current.emit("startAudio"); // 🔑 tell backend to init new stream
        mediaRecorder.start(200); // send every 200ms
      }
    } catch (error) {
      console.error("Error accessing microphone:", error);
      alert("Error accessing microphone. Please check permissions.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      // Stop all tracks to release microphone
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (socketRef.current) {
        socketRef.current.emit("endAudio"); // custom event (end stream on backend)
      }
      
      // Append final transcripts to accumulated input when stopping
      const allTranscripts = finalTranscripts + (currentTranscript ? " " + currentTranscript : "");
      if (allTranscripts.trim()) {
        setInput(prev => prev ? `${prev} ${allTranscripts.trim()}` : allTranscripts.trim());
        setCurrentTranscript("");
        setFinalTranscripts("");
      }
    }
  };

  useEffect(() => {
    // Create socket connection inside useEffect to ensure fresh connection on each mount
    console.log("Creating new socket connection...");
    
    const socket = io("http://localhost:5001", {
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      timeout: 20000,
      forceNew: true, // Force new connection to avoid conflicts
    });
    
    socketRef.current = socket;

    // Socket connection events
    socket.on("connect", () => {
      setIsConnected(true);
      console.log("Connected to server with ID:", socket.id);
    });

    socket.on("disconnect", (reason) => {
      setIsConnected(false);
      console.log("Disconnected from server. Reason:", reason);
    });

    socket.on("connect_error", (error) => {
      console.error("Connection error:", error);
      setIsConnected(false);
    });

    socket.on("transcript", (data) => {
      const { text, isFinal } = data;
      
      if (isFinal) {
        // Add final result to accumulated final transcripts
        setFinalTranscripts(prev => prev ? `${prev} ${text}` : text);
        setCurrentTranscript(""); // Clear interim transcript
      } else {
        // Update interim transcript
        setCurrentTranscript(text);
      }
    });

    // Cleanup on unmount
    return () => {
      console.log("Cleaning up socket connection...");
      if (mediaRecorderRef.current && isRecording) {
        mediaRecorderRef.current.stop();
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
      
      // Remove all listeners
      socket.off("connect");
      socket.off("disconnect");
      socket.off("connect_error");
      socket.off("transcript");
      
      // Disconnect socket
      socket.disconnect();
      socketRef.current = null;
    };
  }, []); // Empty dependency array ensures this runs once per mount

  return (
    <div className="p-4 max-w-md mx-auto">
      <div className="mb-4">
        <div
          className={`inline-block px-2 py-1 rounded text-sm ${
            isConnected
              ? "bg-green-100 text-green-800"
              : "bg-red-100 text-red-800"
          }`}
        >
          {isConnected ? "🟢 Connected" : "🔴 Disconnected"}
        </div>
      </div>

      <div className="mb-4">
        <textarea
          value={input + (finalTranscripts ? (input ? " " : "") + finalTranscripts : "") + (currentTranscript ? (input || finalTranscripts ? " " : "") + currentTranscript : "")}
          readOnly
          placeholder="Speech will appear here..."
          className="w-full p-2 border border-gray-300 rounded"
          rows={6}
        />
      </div>

      <div className="flex gap-2">
        <button
          onClick={startRecording}
          disabled={!isConnected || isRecording}
          className={`px-4 py-2 rounded ${
            isRecording
              ? "bg-gray-300 cursor-not-allowed"
              : "bg-blue-500 hover:bg-blue-600 text-white"
          }`}
        >
          🎙 {isRecording ? "Recording..." : "Start Recording"}
        </button>

        <button
          onClick={stopRecording}
          disabled={!isRecording}
          className={`px-4 py-2 rounded ${
            !isRecording
              ? "bg-gray-300 cursor-not-allowed"
              : "bg-red-500 hover:bg-red-600 text-white"
          }`}
        >
          ⏹ Stop
        </button>
      </div>
    </div>
  );
}

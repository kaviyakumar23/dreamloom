/**
 * Microphone capture hook — captures PCM audio via AudioWorklet and sends to WebSocket.
 */
import { useCallback, useRef, useState } from "react";

interface UseAudioCaptureOptions {
  sampleRate?: number;
  onAudioData: (data: ArrayBuffer) => void;
}

export function useAudioCapture({
  sampleRate = 16000,
  onAudioData,
}: UseAudioCaptureOptions) {
  const [isCapturing, setIsCapturing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);

  const startCapture = useCallback(async () => {
    try {
      setError(null);

      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      streamRef.current = stream;

      // Detect mic permission revocation mid-session
      stream.getAudioTracks()[0]?.addEventListener("ended", () => {
        setIsCapturing(false);
        setError("Microphone disconnected");
        stopCapture();
      });

      // Create AudioContext
      const audioContext = new AudioContext({ sampleRate });
      audioContextRef.current = audioContext;

      // Load AudioWorklet processor
      await audioContext.audioWorklet.addModule("/pcm-capture-processor.js");

      // Create source and worklet node
      const source = audioContext.createMediaStreamSource(stream);
      const workletNode = new AudioWorkletNode(
        audioContext,
        "pcm-capture-processor"
      );
      workletNodeRef.current = workletNode;

      // Handle PCM data from worklet
      workletNode.port.onmessage = (event) => {
        if (event.data.type === "audio-data") {
          // Convert Float32Array to Int16 PCM
          const float32 = event.data.data as Float32Array;
          const int16 = new Int16Array(float32.length);
          for (let i = 0; i < float32.length; i++) {
            const s = Math.max(-1, Math.min(1, float32[i]));
            int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
          }
          onAudioData(int16.buffer);
        }
      };

      // Connect the audio graph
      source.connect(workletNode);
      workletNode.connect(audioContext.destination);

      setIsCapturing(true);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Microphone access denied";
      setError(message);
      console.error("Audio capture error:", err);
    }
  }, [sampleRate, onAudioData]);

  const stopCapture = useCallback(() => {
    workletNodeRef.current?.disconnect();
    workletNodeRef.current = null;

    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;

    audioContextRef.current?.close();
    audioContextRef.current = null;

    setIsCapturing(false);
  }, []);

  const toggleCapture = useCallback(() => {
    if (isCapturing) {
      stopCapture();
    } else {
      startCapture();
    }
  }, [isCapturing, startCapture, stopCapture]);

  return {
    isCapturing,
    error,
    startCapture,
    stopCapture,
    toggleCapture,
  };
}

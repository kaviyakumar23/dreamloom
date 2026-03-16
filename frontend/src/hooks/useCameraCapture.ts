/**
 * Camera capture hook — captures JPEG frames from webcam and sends to WebSocket.
 */
import { useCallback, useRef, useState } from "react";


interface UseCameraCaptureOptions {
  /** Frames per second to capture (default: 1 fps — we don't need video-rate). */
  fps?: number;
  /** JPEG quality 0-1. */
  quality?: number;
  onFrame: (base64Jpeg: string) => void;
}

export function useCameraCapture({
  fps = 1,
  quality = 0.7,
  onFrame,
}: UseCameraCaptureOptions) {
  const [isCapturing, setIsCapturing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startCapture = useCallback(async () => {
    try {
      setError(null);

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: "environment" },
      });
      streamRef.current = stream;
      setStream(stream);

      // Create hidden video element
      const video = document.createElement("video");
      video.srcObject = stream;
      video.autoplay = true;
      video.playsInline = true;
      await video.play();
      videoRef.current = video;

      // Create canvas for frame capture
      const canvas = document.createElement("canvas");
      canvas.width = 640;
      canvas.height = 480;
      canvasRef.current = canvas;

      // Capture frames at specified FPS
      intervalRef.current = setInterval(() => {
        const ctx = canvas.getContext("2d");
        if (!ctx || !video.videoWidth) return;

        // Clamp canvas dimensions to avoid sending huge frames from high-res cameras
        const maxW = 640, maxH = 480;
        const scale = Math.min(maxW / video.videoWidth, maxH / video.videoHeight, 1);
        canvas.width = Math.round(video.videoWidth * scale);
        canvas.height = Math.round(video.videoHeight * scale);
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        const dataUrl = canvas.toDataURL("image/jpeg", quality);
        // Strip the data URL prefix to get raw base64
        const base64 = dataUrl.split(",")[1];
        if (base64) {
          onFrame(base64);
        }
      }, 1000 / fps);

      setIsCapturing(true);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Camera access denied";
      setError(message);
      console.error("Camera capture error:", err);
    }
  }, [fps, quality, onFrame]);

  const stopCapture = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    videoRef.current?.pause();
    videoRef.current = null;

    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setStream(null);

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
    stream,
    startCapture,
    stopCapture,
    toggleCapture,
  };
}

/**
 * CameraPreview — small PiP window showing live camera feed.
 * Positioned fixed bottom-right, above the audio controls.
 */
import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";

interface CameraPreviewProps {
  stream: MediaStream | null;
}

export function CameraPreview({ stream }: CameraPreviewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !stream) return;
    video.srcObject = stream;
    video.play().catch(() => {});
    return () => {
      video.srcObject = null;
    };
  }, [stream]);

  return (
    <AnimatePresence>
      {stream && (
        <motion.div
          className="fixed bottom-20 left-3 z-30 overflow-hidden rounded-xl border border-white/15 shadow-2xl shadow-black/40 sm:bottom-28 sm:left-auto sm:right-4"
          initial={{ opacity: 0, scale: 0.8, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.8, y: 20 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
        >
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="h-[90px] w-[120px] object-cover sm:h-[120px] sm:w-[160px]"
          />
          {/* Label badge */}
          <div className="absolute left-2 top-2 flex items-center gap-1.5 rounded-md bg-black/60 px-2 py-0.5 backdrop-blur-sm">
            <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
            <span className="font-body text-[10px] font-medium uppercase tracking-wider text-white/80">
              Camera
            </span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

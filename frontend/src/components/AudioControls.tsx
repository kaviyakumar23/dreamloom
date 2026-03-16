/**
 * AudioControls — mic, camera, volume, and text input.
 * Restyled to match the landing page's teal/coral visual language.
 */
import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { ConnectionStatus, GenerationStatus } from "../types";

interface AudioControlsProps {
  connectionStatus: ConnectionStatus;
  isMicOn: boolean;
  isCameraOn: boolean;
  volume: number;
  agentSpeaking: boolean;
  generationStatus?: GenerationStatus;
  isProcessing?: boolean;
  isHost?: boolean;
  onToggleMic: () => void;
  onToggleCamera: () => void;
  onVolumeChange: (v: number) => void;
  onSendText: (text: string) => void;
  onActivityStart?: () => void;
  onActivityEnd?: () => void;
}

export function AudioControls({
  connectionStatus,
  isMicOn,
  isCameraOn,
  volume,
  agentSpeaking,
  generationStatus,
  isProcessing = false,
  isHost = true,
  onToggleMic,
  onToggleCamera,
  onVolumeChange,
  onSendText,
  onActivityStart,
  onActivityEnd,
}: AudioControlsProps) {
  const isConnected = connectionStatus === "connected";
  const [isPTT, setIsPTT] = useState(false);

  // Brief "Interrupted" flash — shown for 800ms after barge-in
  const [wasInterrupted, setWasInterrupted] = useState(false);
  const prevAgentSpeaking = useRef(agentSpeaking);
  useEffect(() => {
    // Detect transition from speaking → not speaking while mic is on (barge-in)
    if (prevAgentSpeaking.current && !agentSpeaking && isMicOn) {
      prevAgentSpeaking.current = agentSpeaking;
      const showId = setTimeout(() => setWasInterrupted(true), 0);
      const hideId = setTimeout(() => setWasInterrupted(false), 800);
      return () => {
        clearTimeout(showId);
        clearTimeout(hideId);
      };
    }
    prevAgentSpeaking.current = agentSpeaking;
  }, [agentSpeaking, isMicOn]);

  return (
    <div className="border-t border-[#9fc7c3]/55 bg-[#f5fbfa]/84 px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-md sm:px-6 sm:py-4">
      <div className="mx-auto flex max-w-2xl flex-wrap items-center justify-center gap-2 sm:justify-between sm:gap-4">
        {/* Left: Mic + Camera */}
        <div className="flex items-center gap-3">
          {/* Microphone button */}
          <motion.button
            onClick={isPTT ? undefined : onToggleMic}
            onPointerDown={isPTT && isConnected && isHost ? () => { onToggleMic(); onActivityStart?.(); } : undefined}
            onPointerUp={isPTT && isConnected && isHost ? () => { onActivityEnd?.(); onToggleMic(); } : undefined}
            onPointerLeave={isPTT && isMicOn ? () => { onActivityEnd?.(); onToggleMic(); } : undefined}
            disabled={!isConnected || !isHost}
            aria-label={!isHost ? "Microphone (viewer mode)" : isPTT ? "Hold to talk" : isMicOn ? "Mute microphone" : "Unmute microphone"}
            aria-pressed={isMicOn}
            className={`relative flex h-12 w-12 items-center justify-center rounded-full transition-all ${
              isMicOn
                ? "bg-gradient-to-r from-dreamloom-accent to-dreamloom-accent-light text-white shadow-[0_0_24px_rgba(28,155,163,0.35)]"
                : "border border-[#9fc7c3]/60 bg-[#edf7f5]/95 text-dreamloom-text/70 hover:border-dreamloom-accent/55 hover:text-dreamloom-text"
            } disabled:opacity-40 disabled:cursor-not-allowed`}
            whileTap={{ scale: 0.95 }}
          >
            {isMicOn ? <MicOnIcon /> : <MicOffIcon />}
            {/* Speaking indicator ring */}
            {isMicOn && (
              <motion.div
                className="absolute inset-0 rounded-full border-2 border-dreamloom-accent-light"
                animate={{ scale: [1, 1.2, 1], opacity: [0.5, 0, 0.5] }}
                transition={{ duration: 1.5, repeat: Infinity }}
              />
            )}
          </motion.button>

          {/* PTT toggle */}
          <button
            onClick={() => setIsPTT((v) => !v)}
            disabled={!isConnected || !isHost}
            aria-label={isPTT ? "Switch to auto voice detection" : "Switch to push-to-talk"}
            title={isPTT ? "PTT on — hold mic to talk" : "PTT off — auto voice detection"}
            className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition-all ${
              isPTT
                ? "border border-dreamloom-accent/45 bg-dreamloom-accent/15 text-dreamloom-accent"
                : "border border-[#9fc7c3]/55 bg-[#edf7f5]/90 text-dreamloom-muted hover:border-dreamloom-accent/40"
            } disabled:opacity-40 disabled:cursor-not-allowed`}
          >
            PTT
          </button>

          {/* Camera button */}
          <motion.button
            onClick={onToggleCamera}
            disabled={!isConnected || !isHost}
            aria-label={!isHost ? "Camera (viewer mode)" : isCameraOn ? "Turn off camera" : "Turn on camera"}
            aria-pressed={isCameraOn}
            className={`flex h-12 w-12 items-center justify-center rounded-full transition-all ${
              isCameraOn
                ? "bg-gradient-to-r from-dreamloom-gold to-[#f0a26f] text-white shadow-[0_0_24px_rgba(225,133,77,0.35)]"
                : "border border-[#9fc7c3]/60 bg-[#edf7f5]/95 text-dreamloom-text/70 hover:border-dreamloom-gold/55 hover:text-dreamloom-text"
            } disabled:opacity-40 disabled:cursor-not-allowed`}
            whileTap={{ scale: 0.95 }}
          >
            {isCameraOn ? <CameraOnIcon /> : <CameraOffIcon />}
          </motion.button>
        </div>

        {/* Center: AI status indicator */}
        <div className="flex min-w-0 items-center gap-2">
          <AnimatePresence mode="wait">
            {generationStatus?.active ? (
              <motion.div
                key="generating"
                className="flex items-center gap-2"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.2 }}
              >
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-dreamloom-gold/30 border-t-dreamloom-gold" />
                <span className="font-body text-sm font-medium text-[#9f5b2d]">
                  {generationStatus.message || "Creating scene..."}
                </span>
              </motion.div>
            ) : wasInterrupted ? (
              <motion.div
                key="interrupted"
                className="flex items-center gap-2"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.15 }}
              >
                <motion.div
                  className="h-2.5 w-2.5 rounded-full bg-dreamloom-accent"
                  animate={{ scale: [1, 0.6, 1] }}
                  transition={{ duration: 0.4 }}
                />
                <span className="font-body text-sm font-medium text-dreamloom-accent">
                  Interrupted<span className="hidden sm:inline"> — listening...</span>
                </span>
              </motion.div>
            ) : agentSpeaking ? (
              <motion.div
                key="speaking"
                className="flex items-center gap-1.5"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.2 }}
              >
                {[0, 1, 2, 3, 4].map((i) => (
                  <motion.div
                    key={i}
                    className="w-1 rounded-full bg-dreamloom-gold"
                    animate={{ height: [4, 18, 4] }}
                    transition={{
                      duration: 0.6,
                      repeat: Infinity,
                      delay: i * 0.1,
                      ease: "easeInOut",
                    }}
                  />
                ))}
                <span className="ml-2 font-display text-base italic text-[#9f5b2d]">
                  <span className="hidden sm:inline">Loom is speaking...</span>
                  <span className="sm:hidden">Speaking...</span>
                </span>
                {isMicOn && (
                  <span className="ml-1.5 hidden font-body text-xs text-dreamloom-muted/70 md:inline">
                    (speak to interrupt)
                  </span>
                )}
              </motion.div>
            ) : isProcessing ? (
              <motion.div
                key="processing"
                className="flex items-center gap-2"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.2 }}
              >
                <div className="flex items-center gap-1">
                  {[0, 1, 2].map((i) => (
                    <motion.div
                      key={i}
                      className="h-1.5 w-1.5 rounded-full bg-dreamloom-accent"
                      animate={{ opacity: [0.3, 1, 0.3], scale: [0.8, 1.1, 0.8] }}
                      transition={{
                        duration: 1,
                        repeat: Infinity,
                        delay: i * 0.2,
                        ease: "easeInOut",
                      }}
                    />
                  ))}
                </div>
                <span className="font-body text-sm text-dreamloom-muted">
                  Thinking...
                </span>
              </motion.div>
            ) : isMicOn && isConnected ? (
              <motion.div
                key="listening"
                className="flex items-center gap-2"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.2 }}
              >
                <motion.div
                  className="h-2 w-2 rounded-full bg-dreamloom-accent"
                  animate={{ scale: [1, 1.4, 1], opacity: [0.7, 1, 0.7] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                />
                <span className="font-body text-sm text-dreamloom-muted">
                  Listening...
                </span>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>

        {/* Right: Volume + Text input */}
        <div className="flex items-center gap-3">
          {/* Volume slider */}
          <div className="flex items-center gap-2">
            <VolumeIcon />
            <input
              type="range"
              min={0}
              max={1}
              step={0.1}
              value={volume}
              onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
              aria-label="Volume"
              className="h-1 w-14 cursor-pointer appearance-none rounded-full bg-[#d8ece9] accent-dreamloom-accent sm:w-20"
            />
          </div>

          {/* Quick text input — hidden on small mobile, voice is primary */}
          <form
            className="hidden sm:flex"
            onSubmit={(e) => {
              e.preventDefault();
              const input = e.currentTarget.elements.namedItem(
                "textInput"
              ) as HTMLInputElement;
              if (input.value.trim()) {
                onSendText(input.value.trim());
                input.value = "";
              }
            }}
          >
            <input
              name="textInput"
              type="text"
              placeholder="Type instead..."
              disabled={!isConnected}
              className="w-full rounded-l-lg border border-[#9fc7c3]/60 bg-[#f8fcfb] px-3 py-2 font-body text-sm text-dreamloom-text placeholder:text-dreamloom-muted/70 focus:border-dreamloom-accent/55 focus:outline-none disabled:opacity-40 sm:w-44"
            />
            <button
              type="submit"
              disabled={!isConnected}
              className="rounded-r-lg bg-gradient-to-r from-dreamloom-accent to-dreamloom-gold px-4 py-2 font-body text-sm font-semibold text-white transition-colors hover:from-[#187e86] hover:to-[#c7723f] disabled:opacity-40"
            >
              Send
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

/* Icons */
function MicOnIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" x2="12" y1="19" y2="22" />
    </svg>
  );
}

function MicOffIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="2" x2="22" y1="2" y2="22" />
      <path d="M18.89 13.23A7.12 7.12 0 0 0 19 12v-2" />
      <path d="M5 10v2a7 7 0 0 0 12 5.29" />
      <path d="M15 9.34V5a3 3 0 0 0-5.68-1.33" />
      <path d="M9 9v3a3 3 0 0 0 5.12 2.12" />
      <line x1="12" x2="12" y1="19" y2="22" />
    </svg>
  );
}

function CameraOnIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5" />
      <rect x="2" y="6" width="14" height="12" rx="2" />
    </svg>
  );
}

function CameraOffIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="2" x2="22" y1="2" y2="22" />
      <path d="M10.66 6H14a2 2 0 0 1 2 2v2.5l5.248-3.062A.5.5 0 0 1 22 7.87v8.196" />
      <path d="M16 16a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h2" />
    </svg>
  );
}

function VolumeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-dreamloom-muted">
      <path d="M11 5 6 9H2v6h4l5 4V5Z" />
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
    </svg>
  );
}

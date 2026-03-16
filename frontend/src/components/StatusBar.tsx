/**
 * StatusBar — cinematic top bar with connection status, kid-safe toggle, and story bible toggle.
 * Uses Cormorant Garamond display + Outfit body fonts, warm gold palette.
 */
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { Collaborator, ConnectionStatus, SaveStatus, VoiceStyle } from "../types";
import { VOICE_STYLES } from "../types";

interface StatusBarProps {
  connectionStatus: ConnectionStatus;
  sessionId: string;
  kidSafeMode: boolean;
  saveStatus?: SaveStatus;
  voiceStyle?: VoiceStyle;
  collaborators?: Collaborator[];
  onConnect: () => void;
  onDisconnect: () => void;
  onToggleBible: () => void;
  onToggleKidSafe: () => void;
  onVoiceStyleChange?: (style: VoiceStyle) => void;
}

export function StatusBar({
  connectionStatus,
  sessionId,
  kidSafeMode,
  saveStatus,
  voiceStyle = "dramatic",
  collaborators = [],
  onConnect,
  onDisconnect,
  onToggleBible,
  onToggleKidSafe,
  onVoiceStyleChange,
}: StatusBarProps) {
  const [voicePickerOpen, setVoicePickerOpen] = useState(false);
  const currentStyleLabel = VOICE_STYLES.find((s) => s.value === voiceStyle)?.label || "Dramatic";
  const statusConfig: Record<
    ConnectionStatus,
    { color: string; label: string }
  > = {
    disconnected: { color: "bg-gray-400", label: "Disconnected" },
    connecting: { color: "bg-dreamloom-gold", label: "Connecting..." },
    connected: { color: "bg-green-400", label: "Connected" },
    reconnecting: { color: "bg-dreamloom-gold", label: "Reconnecting..." },
    error: { color: "bg-red-400", label: "Error" },
  };

  const { color, label } = statusConfig[connectionStatus];

  return (
    <div role="banner" className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 bg-dreamloom-surface/80 px-3 sm:px-6 py-2 sm:py-3 backdrop-blur-md">
      {/* Logo */}
      <div className="flex items-center gap-2 sm:gap-3">
        <h1 className="font-display text-xl sm:text-2xl font-bold">
          <span className="bg-gradient-to-r from-white to-[#d4c4a8] bg-clip-text text-transparent">
            Dream
          </span>
          <span className="bg-gradient-to-r from-dreamloom-gold to-[#d4a843] bg-clip-text text-transparent">
            Loom
          </span>
        </h1>
        <span className="hidden sm:inline font-body text-sm text-dreamloom-muted">
          AI Story Studio
        </span>
      </div>

      {/* Center: Actions */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Story Bible toggle */}
        <button
          onClick={onToggleBible}
          aria-label="Story Bible"
          className="rounded-lg border border-white/10 px-3 py-1.5 font-body text-sm text-dreamloom-text/70 transition-colors hover:border-dreamloom-gold/40 hover:text-dreamloom-gold"
          title="Story Bible (B)"
        >
          <BookIcon />
        </button>

        {/* Kid-safe toggle */}
        <button
          onClick={onToggleKidSafe}
          aria-pressed={kidSafeMode}
          className={`rounded-lg border px-3 py-1.5 font-body text-sm font-medium transition-colors ${
            kidSafeMode
              ? "border-green-400/30 text-green-400 hover:border-green-400/60"
              : "border-orange-400/30 text-orange-400 hover:border-orange-400/60"
          }`}
          title={kidSafeMode ? "Kid-Safe: ON" : "Kid-Safe: OFF"}
        >
          <span className="hidden sm:inline">{kidSafeMode ? "Kid-Safe" : "Mature"}</span>
          <span className="sm:hidden">{kidSafeMode ? "KS" : "18+"}</span>
        </button>

        {/* Voice style picker */}
        {onVoiceStyleChange && (
          <div className="relative hidden sm:block">
            <button
              onClick={() => setVoicePickerOpen((o) => !o)}
              aria-expanded={voicePickerOpen}
              aria-label="Voice style"
              className="rounded-lg border border-white/10 px-3 py-1.5 font-body text-sm text-dreamloom-text/70 transition-colors hover:border-dreamloom-accent/40 hover:text-dreamloom-accent-light"
              title="Voice style"
            >
              {currentStyleLabel}
            </button>
            <AnimatePresence>
              {voicePickerOpen && (
                <motion.div
                  className="absolute right-0 top-full z-50 mt-2 w-52 rounded-xl border border-white/15 bg-dreamloom-surface/95 p-2 shadow-2xl backdrop-blur-xl"
                  initial={{ opacity: 0, y: -8, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -8, scale: 0.95 }}
                  transition={{ duration: 0.15 }}
                >
                  {VOICE_STYLES.map((s) => (
                    <button
                      key={s.value}
                      onClick={() => {
                        onVoiceStyleChange(s.value);
                        setVoicePickerOpen(false);
                      }}
                      className={`flex w-full flex-col rounded-lg px-3 py-2 text-left transition-colors ${
                        voiceStyle === s.value
                          ? "bg-dreamloom-accent/20 text-dreamloom-accent-light"
                          : "text-dreamloom-text/70 hover:bg-white/5 hover:text-white"
                      }`}
                    >
                      <span className="font-body text-sm font-medium">{s.label}</span>
                      <span className="font-body text-xs text-dreamloom-muted">{s.description}</span>
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* Collaborators */}
        {collaborators.length > 1 && (
          <div className="hidden items-center gap-1 sm:flex" title={collaborators.map((c) => `${c.displayName} (${c.role})`).join(", ")}>
            {collaborators.map((c, i) => (
              <div
                key={`${c.userId}-${i}`}
                className="flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold text-white"
                style={{ backgroundColor: c.color }}
              >
                {c.displayName.charAt(0).toUpperCase()}
              </div>
            ))}
            <span className="ml-1 font-body text-xs text-dreamloom-muted">
              {collaborators.length}
            </span>
          </div>
        )}

        {/* Session info + save status */}
        {sessionId && (
          <span className="hidden font-body text-sm text-dreamloom-muted/70 sm:inline">
            Session: {sessionId.slice(0, 8)}
          </span>
        )}
        {saveStatus === "saving" && (
          <span className="flex items-center gap-1.5 text-xs text-dreamloom-muted">
            <motion.div
              className="h-3 w-3 rounded-full border border-dreamloom-muted/30 border-t-dreamloom-muted"
              animate={{ rotate: 360 }}
              transition={{ duration: 0.6, repeat: Infinity, ease: "linear" }}
            />
            Saving...
          </span>
        )}
        {saveStatus === "saved" && (
          <motion.span
            className="flex items-center gap-1 text-xs text-green-400"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            Saved
          </motion.span>
        )}
      </div>

      {/* Right: Status + action */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Status indicator */}
        <div className="flex items-center gap-2">
          <motion.div
            className={`h-2.5 w-2.5 rounded-full ${color}`}
            animate={
              connectionStatus === "connecting" || connectionStatus === "reconnecting"
                ? { scale: [1, 1.3, 1], opacity: [1, 0.5, 1] }
                : {}
            }
            transition={
              connectionStatus === "connecting" || connectionStatus === "reconnecting"
                ? { duration: 1, repeat: Infinity }
                : {}
            }
          />
          <span className="hidden font-body text-sm text-dreamloom-text/70 sm:inline">{label}</span>
        </div>

        {/* Connect/Disconnect button */}
        {connectionStatus === "disconnected" || connectionStatus === "error" || connectionStatus === "reconnecting" ? (
          <button
            onClick={onConnect}
            className="rounded-full bg-dreamloom-gold px-3 sm:px-5 py-1.5 font-body text-sm font-medium text-dreamloom-bg transition-colors hover:bg-dreamloom-gold/80"
          >
            Connect
          </button>
        ) : connectionStatus === "connected" ? (
          <button
            onClick={onDisconnect}
            className="rounded-full border border-white/15 px-3 sm:px-5 py-1.5 font-body text-sm text-dreamloom-text/70 transition-colors hover:border-red-400/50 hover:text-red-400"
          >
            End Session
          </button>
        ) : null}
      </div>
    </div>
  );
}

function BookIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20" />
    </svg>
  );
}

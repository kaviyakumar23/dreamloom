/**
 * ShortcutsOverlay — keyboard shortcuts help modal.
 */
import { useEffect } from "react";
import { motion } from "framer-motion";

interface ShortcutsOverlayProps {
  onClose: () => void;
}

const SHORTCUTS = [
  { keys: ["M", "Space"], description: "Toggle microphone" },
  { keys: ["C"], description: "Toggle camera" },
  { keys: ["B"], description: "Toggle Story Bible" },
  { keys: ["D"], description: "Toggle Debug panel" },
  { keys: ["?"], description: "Show shortcuts" },
  { keys: ["Esc"], description: "Close panels" },
];

export function ShortcutsOverlay({ onClose }: ShortcutsOverlayProps) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <motion.div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-[#0f2a3a]/35 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label="Keyboard shortcuts"
        className="mx-4 w-full max-w-md rounded-2xl border border-[#9fc7c3]/65 bg-[#f7fcfb]/95 p-6 backdrop-blur-xl shadow-2xl"
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        transition={{ duration: 0.2 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 className="font-display text-xl font-semibold text-dreamloom-text">Keyboard Shortcuts</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-dreamloom-muted transition-colors hover:text-dreamloom-text"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="space-y-3">
          {SHORTCUTS.map(({ keys, description }) => (
            <div key={description} className="flex items-center justify-between">
              <span className="font-body text-sm text-dreamloom-text/80">{description}</span>
              <div className="flex gap-1.5">
                {keys.map((key) => (
                  <kbd
                    key={key}
                    className="min-w-[2rem] rounded-md border border-[#a8cfcb]/60 bg-[#eef8f6] px-2 py-1 text-center font-mono text-xs text-dreamloom-text"
                  >
                    {key}
                  </kbd>
                ))}
              </div>
            </div>
          ))}
        </div>

        <p className="mt-5 text-center font-body text-xs text-dreamloom-muted">
          Press <kbd className="rounded border border-[#a8cfcb]/60 bg-[#eef8f6] px-1.5 py-0.5 font-mono text-xs">?</kbd> anytime to show this
        </p>
      </motion.div>
    </motion.div>
  );
}

/**
 * DebugPanel — collapsible "Under the Hood" panel showing interleaved proof.
 * Shows model name, response_modalities, part order, and generation time.
 */
import { motion, AnimatePresence } from "framer-motion";
import type { SceneMetadata } from "../types";

interface DebugPanelProps {
  metadata?: SceneMetadata;
  isOpen: boolean;
  onToggle: () => void;
}

export function DebugPanel({ metadata, isOpen, onToggle }: DebugPanelProps) {
  return (
    <div className="fixed bottom-20 right-3 z-30 sm:right-4">
      {/* Toggle button */}
      <button
        onClick={onToggle}
        aria-expanded={isOpen}
        aria-label="Under the Hood"
        className="mb-2 flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-dreamloom-card/80 text-dreamloom-text/50 transition-colors hover:border-white/20 hover:text-dreamloom-text"
        title="Under the Hood (D)"
      >
        <GearIcon />
      </button>

      {/* Panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            role="dialog"
            aria-label="Debug panel"
            className="absolute bottom-12 right-0 w-[calc(100vw-1.5rem)] overflow-hidden rounded-xl border border-white/10 bg-dreamloom-surface/95 backdrop-blur-xl shadow-xl sm:w-80"
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            transition={{ duration: 0.2 }}
          >
            <div className="border-b border-white/10 px-4 py-3">
              <h3 className="font-display text-base font-semibold text-dreamloom-gold">
                Under the Hood
              </h3>
            </div>

            {metadata ? (
              <div className="space-y-3 p-4">
                <Row label="Model" value={metadata.model} />
                <Row
                  label="response_modalities"
                  value={JSON.stringify(metadata.modalities)}
                  mono
                />
                <Row
                  label="Part order"
                  value={metadata.part_order
                    .map((p, i) => `${i}:${p}`)
                    .join(", ")}
                  mono
                />
                <Row
                  label="Generation time"
                  value={`${(metadata.generation_ms / 1000).toFixed(1)}s`}
                />
                {metadata.error && (
                  <Row label="Error" value={metadata.error} error />
                )}
              </div>
            ) : (
              <div className="p-4">
                <p className="font-body text-sm text-dreamloom-muted">
                  Generate a scene to see model details...
                </p>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Row({
  label,
  value,
  mono,
  error,
}: {
  label: string;
  value: string;
  mono?: boolean;
  error?: boolean;
}) {
  return (
    <div>
      <p className="font-body text-sm text-dreamloom-muted">{label}</p>
      <p
        className={`text-sm leading-snug ${
          error
            ? "text-red-400"
            : mono
            ? "font-mono text-dreamloom-gold"
            : "text-dreamloom-text"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function GearIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

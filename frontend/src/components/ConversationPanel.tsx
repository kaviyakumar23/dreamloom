/**
 * ConversationPanel — floating, collapsible panel for agent speech text.
 * Shows the agent's current streaming text separately from the story canvas.
 */
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { stripMarkdown } from "./TypewriterText";

interface ConversationPanelProps {
  text: string;
  agentSpeaking: boolean;
}

export function ConversationPanel({ text, agentSpeaking }: ConversationPanelProps) {
  const [collapsed, setCollapsed] = useState(false);

  // Nothing to show
  if (!text && !agentSpeaking) return null;

  return (
    <motion.div
      className="fixed bottom-20 left-3 right-3 z-30 sm:bottom-24 sm:left-auto sm:right-4 sm:w-96 sm:max-w-[calc(100vw-2rem)]"
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.3 }}
    >
      <div className="overflow-hidden rounded-xl border border-[#9fc8c4]/65 bg-[#f7fcfb]/95 shadow-xl backdrop-blur-lg">
        {/* Header — always visible, click to collapse */}
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left transition-colors hover:bg-[#eef8f6]"
        >
          {/* Speaking indicator */}
          <span className="relative flex h-2.5 w-2.5 shrink-0">
            {agentSpeaking && (
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-dreamloom-gold opacity-60" />
            )}
            <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${
              agentSpeaking ? "bg-dreamloom-gold" : "bg-dreamloom-gold/40"
            }`} />
          </span>

          <span className="flex-1 font-body text-xs font-semibold uppercase tracking-widest text-[#1c717b]">
            {agentSpeaking ? "Loom is speaking" : "Loom"}
          </span>

          {/* Collapse chevron */}
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`text-[#3d6773]/65 transition-transform ${collapsed ? "rotate-180" : ""}`}
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>

        {/* Collapsible body */}
        <AnimatePresence>
          {!collapsed && text && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="max-h-40 overflow-y-auto border-t border-[#a8cfcb]/55 px-4 py-3">
                <p className="font-body text-sm leading-relaxed text-dreamloom-text/92">
                  {stripMarkdown(text)}
                </p>
                {agentSpeaking && (
                  <span className="mt-1 inline-block h-4 w-0.5 animate-pulse rounded-full bg-dreamloom-gold" />
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

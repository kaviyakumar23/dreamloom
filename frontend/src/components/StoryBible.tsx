/**
 * StoryBible — slide-out side panel showing live story state.
 * Characters, setting, plot threads, and scene summaries.
 * Cinematic warm-gold design language.
 */
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { StoryBibleData } from "../types";

const AVATAR_COLORS = [
  "bg-amber-500",
  "bg-rose-500",
  "bg-sky-500",
  "bg-emerald-500",
  "bg-violet-500",
  "bg-orange-500",
];

function hashName(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash << 5) - hash + name.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

interface StoryBibleProps {
  data: StoryBibleData;
  isOpen: boolean;
  onClose: () => void;
}

export function StoryBible({ data, isOpen, onClose }: StoryBibleProps) {
  const characterEntries = Object.entries(data.characters);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 z-40 bg-black/50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          {/* Panel */}
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Story Bible"
            className="fixed right-0 top-0 z-50 h-full w-full overflow-y-auto border-l border-white/10 bg-dreamloom-surface/95 backdrop-blur-xl sm:w-96"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
              <h2 className="font-display text-xl font-bold text-white">Story Bible</h2>
              <button
                onClick={onClose}
                className="text-dreamloom-muted transition-colors hover:text-white"
                aria-label="Close Story Bible"
              >
                <CloseIcon />
              </button>
            </div>

            <div className="p-5 space-y-6">
              {/* Story info */}
              {data.title && (
                <Section title="Story">
                  <p className="font-display text-lg font-semibold text-white">{data.title}</p>
                  {data.genre && (
                    <span className="mt-2 inline-block rounded-full border border-dreamloom-gold/30 bg-dreamloom-gold/10 px-3 py-0.5 font-body text-sm text-dreamloom-gold">
                      {data.genre}
                    </span>
                  )}
                  {data.style && (
                    <p className="mt-2 font-body text-sm text-dreamloom-muted">
                      Style: {data.style}
                    </p>
                  )}
                </Section>
              )}

              {/* World */}
              {data.worldDescription && (
                <Section title="World">
                  <p className="font-body text-base leading-relaxed text-dreamloom-text/80">
                    {data.worldDescription}
                  </p>
                </Section>
              )}

              {/* Characters */}
              {characterEntries.length > 0 && (
                <Section title={`Characters (${characterEntries.length})`}>
                  <div className="space-y-3">
                    {characterEntries.map(([name, desc]) => (
                      <CharacterCard key={name} name={name} description={desc} />
                    ))}
                  </div>
                </Section>
              )}

              {/* Scenes */}
              {data.scenes.length > 0 && (
                <Section title={`Scenes (${data.scenes.length})`}>
                  <div className="space-y-2">
                    {data.scenes.map((scene) => (
                      <div
                        key={scene.sceneNumber}
                        className="flex gap-3 rounded-xl border border-white/5 bg-dreamloom-card/30 p-3"
                      >
                        {scene.thumbnail && (
                          <img
                            src={scene.thumbnail}
                            alt={`Scene ${scene.sceneNumber}`}
                            className="h-14 w-14 rounded-lg object-cover"
                          />
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="font-body text-sm font-medium text-white">
                            Scene {scene.sceneNumber}
                            {scene.title && `: ${scene.title}`}
                          </p>
                          <p className="mt-0.5 truncate font-body text-sm text-dreamloom-muted">
                            {scene.narration || "No narration"}
                          </p>
                          {scene.mood && (
                            <span className="mt-1 inline-block font-body text-sm text-dreamloom-gold">
                              {scene.mood}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </Section>
              )}

              {/* Empty state */}
              {!data.title && characterEntries.length === 0 && data.scenes.length === 0 && (
                <p className="text-center font-display text-base italic text-dreamloom-muted/70">
                  Start a story to populate the bible...
                </p>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function CharacterCard({ name, description }: { name: string; description: string }) {
  const [expanded, setExpanded] = useState(false);
  const colorClass = AVATAR_COLORS[hashName(name) % AVATAR_COLORS.length];
  const initial = name.charAt(0).toUpperCase();

  return (
    <button
      onClick={() => setExpanded((e) => !e)}
      aria-expanded={expanded}
      className="w-full text-left rounded-xl border-l-2 border-l-dreamloom-gold/40 border border-white/5 bg-dreamloom-card/50 p-4 transition-colors hover:bg-dreamloom-card/70"
    >
      <div className="flex items-center gap-3">
        <div className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full ${colorClass} text-white font-display text-sm font-bold`}>
          {initial}
        </div>
        <p className="font-display text-base font-semibold text-dreamloom-gold flex-1">
          {name}
        </p>
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`text-dreamloom-muted transition-transform ${expanded ? "rotate-180" : ""}`}
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </div>
      {expanded && (
        <p className="mt-3 font-body text-sm leading-relaxed text-dreamloom-text/70">
          {description}
        </p>
      )}
    </button>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-3 flex items-center gap-3">
        <h3 className="font-body text-xs font-semibold uppercase tracking-widest text-dreamloom-gold/70">
          {title}
        </h3>
        <span className="h-px flex-1 bg-white/8" />
      </div>
      {children}
    </div>
  );
}

function CloseIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}

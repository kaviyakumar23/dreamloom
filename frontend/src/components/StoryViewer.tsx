/**
 * StoryViewer — fullscreen portal modal for read-only viewing of a published story.
 */
import { useEffect } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import type { PublishedStoryFull } from "../hooks/useGallery";

interface StoryViewerProps {
  story: PublishedStoryFull;
  onClose: () => void;
}

export function StoryViewer({ story, onClose }: StoryViewerProps) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return createPortal(
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-label="Story viewer"
      className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-black/90 py-8"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      {/* Close button */}
      <button
        onClick={onClose}
        className="fixed right-4 top-4 z-10 rounded-full bg-white/10 p-2 text-white transition-colors hover:bg-white/20"
        aria-label="Close viewer"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>

      <motion.div
        className="mx-auto w-full max-w-2xl rounded-2xl border border-white/10 bg-dreamloom-surface"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.4 }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cover image hero */}
        {story.cover_url && (
          <div className="relative">
            <img
              src={story.cover_url}
              alt="Story cover"
              className="w-full rounded-t-2xl object-cover"
            />
            <div className="pointer-events-none absolute inset-0 shadow-[inset_0_0_80px_rgba(0,0,0,0.5)]" />
          </div>
        )}

        <div className="space-y-6 p-6">
          {/* Title + genre badge */}
          <div>
            <h2 className="font-display text-3xl font-bold text-white">
              {story.title}
            </h2>
            {story.genre && (
              <span className="mt-2 inline-block rounded-full border border-dreamloom-gold/25 bg-dreamloom-gold/10 px-3 py-0.5 font-body text-xs text-dreamloom-gold">
                {story.genre}
              </span>
            )}
          </div>

          {/* Logline */}
          {story.logline && (
            <p className="font-display text-lg italic leading-relaxed text-dreamloom-text/80">
              "{story.logline}"
            </p>
          )}

          {/* Scene blocks */}
          {story.scenes && story.scenes.length > 0 && (
            <div className="space-y-8">
              {story.scenes.map((blocks, sceneIdx) => (
                <div key={sceneIdx} className="space-y-3">
                  <p className="font-body text-[11px] uppercase tracking-[0.25em] text-dreamloom-gold/70">
                    Scene {sceneIdx + 1}
                  </p>
                  {(Array.isArray(blocks) ? blocks : []).map((block, blockIdx) => {
                    if (block.type === "text" && block.content) {
                      return (
                        <p key={blockIdx} className="font-body text-sm leading-relaxed text-dreamloom-text/85">
                          {block.content}
                        </p>
                      );
                    }
                    if (block.type === "image" && block.url) {
                      return (
                        <img
                          key={blockIdx}
                          src={block.url}
                          alt={`Scene ${sceneIdx + 1}`}
                          className="w-full rounded-xl"
                        />
                      );
                    }
                    return null;
                  })}
                </div>
              ))}
            </div>
          )}

          {/* Footer */}
          <div className="border-t border-white/10 pt-4 text-center">
            <p className="font-body text-xs text-dreamloom-muted">
              Created with DreamLoom
            </p>
          </div>
        </div>
      </motion.div>
    </motion.div>,
    document.body
  );
}

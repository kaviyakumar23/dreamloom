/**
 * StoryViewer — fullscreen portal modal for read-only viewing of a published story.
 */
import { useEffect } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import type { PublishedStoryFull } from "../hooks/useGallery";

const API_BASE = import.meta.env.VITE_API_URL || window.location.origin;

/** Resolve media URLs — relative paths get prefixed with API_BASE. */
function mediaUrl(url: string): string {
  if (!url) return "";
  if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("data:")) return url;
  return `${API_BASE}${url.startsWith("/") ? "" : "/"}${url}`;
}

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

  // Use scene_images (has titles) if available, fall back to scenes
  const sceneData = (story.scene_images && story.scene_images.length > 0)
    ? story.scene_images.map((si) => ({
        title: si.title || "",
        narration: si.narration || "",
        imageUrl: si.url || "",
      }))
    : (story.scenes || []).map((s) => ({
        title: "",
        narration: (s as { narration?: string }).narration || "",
        imageUrl: (s as { image_url?: string }).image_url || "",
      }));

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
        {/* Cover image hero with title overlay */}
        {story.cover_url && (
          <div className="relative">
            <img
              src={mediaUrl(story.cover_url)}
              alt="Story cover"
              className="w-full rounded-t-2xl object-cover"
            />
            {/* Gradient overlay for text readability */}
            <div className="pointer-events-none absolute inset-0 rounded-t-2xl bg-gradient-to-t from-black/70 via-transparent to-transparent" />
            {/* Title overlaid on cover */}
            <div className="absolute bottom-0 left-0 right-0 p-6">
              <h2 className="font-display text-3xl font-bold text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.7)]">
                {story.title}
              </h2>
              {story.genre && (
                <span className="mt-2 inline-block rounded-full border border-white/25 bg-white/15 px-3 py-0.5 font-body text-xs text-white backdrop-blur-sm">
                  {story.genre}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Title fallback when no cover image */}
        {!story.cover_url && (
          <div className="p-6 pb-0">
            <h2 className="font-display text-3xl font-bold text-dreamloom-text">
              {story.title}
            </h2>
            {story.genre && (
              <span className="mt-2 inline-block rounded-full border border-dreamloom-gold/25 bg-dreamloom-gold/10 px-3 py-0.5 font-body text-xs text-dreamloom-gold">
                {story.genre}
              </span>
            )}
          </div>
        )}

        <div className="space-y-6 p-6">
          {/* Logline */}
          {story.logline && (
            <p className="font-display text-lg italic leading-relaxed text-dreamloom-text/80">
              &ldquo;{story.logline}&rdquo;
            </p>
          )}

          {/* Scene cards */}
          {sceneData.length > 0 && (
            <div className="space-y-8">
              {sceneData.map((scene, idx) => (
                <div key={idx} className="space-y-3">
                  <div className="flex items-baseline gap-3">
                    <p className="font-body text-[11px] uppercase tracking-[0.25em] text-dreamloom-gold/70">
                      Scene {idx + 1}
                    </p>
                    {scene.title && (
                      <p className="font-display text-sm font-medium text-dreamloom-text/70">
                        {scene.title}
                      </p>
                    )}
                  </div>
                  {scene.imageUrl && (
                    <img
                      src={mediaUrl(scene.imageUrl)}
                      alt={scene.title || `Scene ${idx + 1}`}
                      className="w-full rounded-xl"
                    />
                  )}
                  {scene.narration && (
                    <p className="font-body text-sm leading-relaxed text-dreamloom-text/85">
                      {scene.narration}
                    </p>
                  )}
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

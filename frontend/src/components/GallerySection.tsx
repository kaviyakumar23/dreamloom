/**
 * GallerySection — public gallery of published stories for the landing page.
 * Hidden entirely when no published stories exist.
 */
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { PublishedStorySummary, PublishedStoryFull } from "../hooks/useGallery";
import { StoryViewer } from "./StoryViewer";

const API_BASE = import.meta.env.VITE_API_URL || window.location.origin;

function mediaUrl(url: string): string {
  if (!url) return "";
  if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("data:")) return url;
  return `${API_BASE}${url.startsWith("/") ? "" : "/"}${url}`;
}

interface GallerySectionProps {
  stories: PublishedStorySummary[];
  fetchStory: (publishId: string) => Promise<PublishedStoryFull | null>;
}

export function GallerySection({ stories, fetchStory }: GallerySectionProps) {
  const [viewerStory, setViewerStory] = useState<PublishedStoryFull | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  if (stories.length === 0) return null;

  const handleCardClick = async (publishId: string) => {
    setLoadingId(publishId);
    const full = await fetchStory(publishId);
    setLoadingId(null);
    if (full) setViewerStory(full);
  };

  return (
    <>
      <section id="gallery" className="px-6 py-20 sm:px-10 sm:py-24">
        <div className="mx-auto max-w-6xl">
          <div className="mb-10 flex items-end justify-between gap-4">
            <div>
              <p className="mb-2 font-body text-[11px] uppercase tracking-[0.28em] text-dreamloom-gold/70">
                Community
              </p>
              <h2 className="font-display text-3xl text-white sm:text-4xl">Featured Stories</h2>
            </div>
            <div className="hidden h-px flex-1 bg-gradient-to-r from-dreamloom-gold/25 to-transparent md:block" />
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {stories.map((story) => (
              <motion.button
                key={story.publish_id}
                onClick={() => handleCardClick(story.publish_id)}
                disabled={loadingId === story.publish_id}
                className="group relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] text-left transition-transform hover:scale-[1.01] hover:border-dreamloom-gold/25 disabled:opacity-70"
                initial={{ opacity: 0, y: 18 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.25 }}
                transition={{ duration: 0.45 }}
              >
                {/* Cover image */}
                <div className="relative aspect-[3/4] w-full overflow-hidden bg-dreamloom-card">
                  {story.cover_url ? (
                    <img
                      src={mediaUrl(story.cover_url)}
                      alt={story.title}
                      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-dreamloom-gold/10 to-dreamloom-accent/10">
                      <span className="font-display text-4xl text-white/20">
                        {story.title.charAt(0)}
                      </span>
                    </div>
                  )}

                  {/* Gradient overlay */}
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

                  {/* Title overlay */}
                  <div className="absolute bottom-0 left-0 right-0 p-4">
                    {story.genre && (
                      <span className="mb-2 inline-block rounded-full border border-dreamloom-gold/25 bg-dreamloom-gold/10 px-2.5 py-0.5 font-body text-[10px] text-dreamloom-gold backdrop-blur-sm">
                        {story.genre}
                      </span>
                    )}
                    <h3 className="font-display text-lg text-white">{story.title}</h3>
                    {story.logline && (
                      <p className="mt-1 line-clamp-1 font-body text-xs text-dreamloom-text/70">
                        {story.logline}
                      </p>
                    )}
                  </div>

                  {/* Loading spinner overlay */}
                  {loadingId === story.publish_id && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                      <motion.div
                        className="h-6 w-6 rounded-full border-2 border-dreamloom-gold/30 border-t-dreamloom-gold"
                        animate={{ rotate: 360 }}
                        transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}
                      />
                    </div>
                  )}
                </div>
              </motion.button>
            ))}
          </div>
        </div>
      </section>

      {/* Story viewer modal */}
      <AnimatePresence>
        {viewerStory && (
          <StoryViewer
            story={viewerStory}
            onClose={() => setViewerStory(null)}
          />
        )}
      </AnimatePresence>
    </>
  );
}

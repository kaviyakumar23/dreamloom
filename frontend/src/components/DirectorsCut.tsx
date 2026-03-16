/**
 * DirectorsCut — cinematic finale card for the Director's Cut package.
 * Cover image, logline, downloadable video, and scene gallery.
 */
import { useRef } from "react";
import { motion } from "framer-motion";
import type { DirectorsCutData, StoryPage } from "../types";
import { useAnimatic } from "../hooks/useAnimatic";
import { useExport } from "../hooks/useExport";
import { PublishButton } from "./PublishButton";

interface DirectorsCutProps {
  data: DirectorsCutData;
  pages: StoryPage[];
  userId?: string;
  sessionId?: string;
  storyTitle?: string;
  storyGenre?: string;
  storyStyle?: string;
  onClose: () => void;
}

export function DirectorsCut({ data, pages, userId, sessionId, storyTitle, storyGenre, storyStyle }: DirectorsCutProps) {
  const { generate, generating, progress, blobUrl } = useAnimatic();
  const { exportToPdf, exportToImage, exporting } = useExport();
  const contentRef = useRef<HTMLDivElement>(null);

  const handleGenerateAnimatic = () => {
    console.log("[DirectorsCut] Generate video clicked");
    console.log(`[DirectorsCut] Pages: ${pages.length}`);
    pages.forEach((p, i) => {
      console.log(`[DirectorsCut]   Page ${i + 1}: scene=${p.sceneNumber}, title="${p.title}", image=${p.imageUrl ? "YES" : "NO"}, music=${p.musicUrl || "none"}, narration=${(p.narration || "").length} chars, blocks=${p.blocks.length}`);
    });
    generate(pages);
  };

  return (
    <motion.div
      className="mx-auto mb-8 max-w-2xl px-4"
      initial={{ opacity: 0, y: 40 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8, ease: "easeOut" }}
    >
      <div ref={contentRef} className="relative overflow-hidden rounded-2xl border border-dreamloom-gold/30 bg-gradient-to-b from-dreamloom-surface to-dreamloom-bg">
        {/* Film grain overlay */}
        <div className="film-grain pointer-events-none absolute inset-0" />

        {/* Header */}
        <motion.div
          className="border-b border-dreamloom-gold/20 px-6 py-5"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
        >
          <div className="flex items-center gap-3">
            <ClapperIcon />
            <h2 className="font-display text-2xl font-bold text-dreamloom-gold">
              Director's Cut
            </h2>
          </div>
        </motion.div>

        {/* Cover image */}
        {data.coverUrl && (
          <motion.div
            className="relative"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.5, duration: 0.8 }}
          >
            <img
              src={data.coverUrl}
              alt="Story cover"
              className="w-full"
            />
            <div className="pointer-events-none absolute inset-0 shadow-[inset_0_0_80px_rgba(0,0,0,0.5)]" />
          </motion.div>
        )}

        <div className="space-y-6 p-5 sm:p-6">
          {/* Logline */}
          {data.logline && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.8 }}
            >
              <SectionLabel>Logline</SectionLabel>
              <p className="mt-2 font-display text-xl font-medium italic leading-relaxed text-white">
                "{data.logline}"
              </p>
            </motion.div>
          )}

          {/* Generate / Watch video */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.0 }}
          >
            <SectionLabel>Story Video</SectionLabel>

            {blobUrl ? (
              <div className="mt-3">
                <video
                  src={blobUrl}
                  controls
                  className="w-full rounded-xl shadow-lg"
                />
                <a
                  href={blobUrl}
                  download="dreamloom-story.webm"
                  className="mt-2 inline-block font-body text-sm text-dreamloom-gold hover:underline"
                >
                  Download WebM
                </a>
              </div>
            ) : generating ? (
              <div className="mt-3 flex items-center gap-3">
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-dreamloom-card">
                  <motion.div
                    className="h-full rounded-full bg-dreamloom-gold"
                    initial={{ width: 0 }}
                    animate={{ width: `${progress}%` }}
                    transition={{ duration: 0.3 }}
                  />
                </div>
                <span className="font-body text-sm text-dreamloom-muted">{progress}%</span>
              </div>
            ) : (
              <button
                onClick={handleGenerateAnimatic}
                disabled={pages.length < 1}
                className="mt-3 flex w-full items-center justify-center gap-3 rounded-xl border border-dreamloom-gold/30 bg-dreamloom-gold/10 px-6 py-4 font-display text-lg font-semibold text-dreamloom-gold transition-all hover:bg-dreamloom-gold/20 hover:border-dreamloom-gold/50 disabled:opacity-40"
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M8 5v14l11-7z" />
                </svg>
                Generate Story Video ({pages.length} scene{pages.length !== 1 ? "s" : ""})
              </button>
            )}
          </motion.div>

          {/* Export buttons */}
          <motion.div
            className="flex gap-3"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.1 }}
          >
            <button
              onClick={() => exportToPdf(contentRef, data.logline || "DreamLoom Story")}
              disabled={exporting}
              className="rounded-lg border border-dreamloom-gold/20 bg-dreamloom-gold/5 px-4 py-2 font-body text-sm text-dreamloom-gold transition-colors hover:bg-dreamloom-gold/15 disabled:opacity-40"
            >
              {exporting ? "Exporting..." : "Export PDF"}
            </button>
            <button
              onClick={() => exportToImage(contentRef, data.logline || "DreamLoom Story")}
              disabled={exporting}
              className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 font-body text-sm text-dreamloom-text/70 transition-colors hover:bg-white/10 disabled:opacity-40"
            >
              {exporting ? "Exporting..." : "Export Image"}
            </button>
            {userId && sessionId && (
              <PublishButton
                directorsCut={data}
                pages={pages}
                storyTitle={storyTitle || ""}
                storyGenre={storyGenre || ""}
                storyStyle={storyStyle || ""}
                userId={userId}
                sessionId={sessionId}
              />
            )}
          </motion.div>

          {/* Scene gallery */}
          {data.sceneImages.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.2 }}
            >
              <SectionLabel>Scene Gallery</SectionLabel>
              <div className="mt-3 flex gap-2 overflow-x-auto pb-2">
                {data.sceneImages.map((img, i) => (
                  <div
                    key={i}
                    className="flex-none"
                    title={img.title}
                  >
                    <img
                      src={img.url}
                      alt={img.title}
                      className="h-20 w-28 sm:h-24 sm:w-32 rounded-xl object-cover shadow-lg"
                    />
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <span className="font-body text-xs font-semibold uppercase tracking-widest text-dreamloom-gold/80">
        {children}
      </span>
      <span className="h-px flex-1 bg-dreamloom-gold/15" />
    </div>
  );
}

function ClapperIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-dreamloom-gold"
    >
      <path d="M20.2 6 3 11l-.9-2.4c-.3-1.1.3-2.2 1.3-2.5l13.5-4c1.1-.3 2.2.3 2.5 1.3Z" />
      <path d="m6.2 5.3 3.1 3.9" />
      <path d="m12.4 3.4 3.1 4" />
      <path d="M3 11h18v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
    </svg>
  );
}

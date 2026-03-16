/**
 * DirectorsCut — cinematic finale card for the Director's Cut package.
 * Cover image, logline, downloadable video, and scene gallery.
 */
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
  sendText?: (text: string) => void;
  onClose: () => void;
}

export function DirectorsCut({ data, pages, userId, sessionId, storyTitle, storyGenre, storyStyle, sendText }: DirectorsCutProps) {
  const { generate, generating, progress, blobUrl } = useAnimatic();
  const { exportToPdf, exportImages, exporting } = useExport();

  const handleGenerateAnimatic = () => {
    console.log("[DirectorsCut] Generate video clicked");
    console.log(`[DirectorsCut] Pages: ${pages.length}`);
    pages.forEach((p, i) => {
      console.log(`[DirectorsCut]   Page ${i + 1}: scene=${p.sceneNumber}, title="${p.title}", image=${p.imageUrl ? "YES" : "NO"}, music=${p.musicUrl || "none"}, narration=${(p.narration || "").length} chars, blocks=${p.blocks.length}`);
    });

    // Ask Loom to announce video generation in its natural voice
    sendText?.(
      "[System: The user just clicked 'Generate Story Video'. Say a brief, excited one-liner about how you're assembling their story video and it'll take a moment. Keep it short and natural — one sentence max.]"
    );

    generate(pages);
  };

  return (
    <motion.div
      className="mx-auto mb-8 max-w-2xl px-4"
      initial={{ opacity: 0, y: 40 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8, ease: "easeOut" }}
    >
      <div
        className="relative overflow-hidden rounded-2xl border border-[#7eb7bc]/55 bg-gradient-to-b from-[#103246] via-[#1a4860] to-[#1f5a73]"
      >
        {/* Film grain overlay */}
        <div className="film-grain pointer-events-none absolute inset-0" />

        {/* Header */}
        <motion.div
          className="border-b border-[#7eb7bc]/45 px-6 py-5"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
        >
          <div className="flex items-center gap-3">
            <ClapperIcon />
            <h2 className="font-display text-2xl font-semibold text-[#f3dbc7]">
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
              <p className="mt-2 font-display text-xl font-medium italic leading-relaxed text-[#ecf6f8]">
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
                  className="mt-2 inline-block font-body text-sm text-[#ffdcbf] hover:underline"
                >
                  Download WebM
                </a>
              </div>
            ) : generating ? (
              <div className="mt-3 flex items-center gap-3">
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-[#2a6175]/70">
                  <motion.div
                    className="h-full rounded-full bg-dreamloom-gold"
                    initial={{ width: 0 }}
                    animate={{ width: `${progress}%` }}
                    transition={{ duration: 0.3 }}
                  />
                </div>
                <span className="font-body text-sm text-[#c9dee3]">{progress}%</span>
              </div>
            ) : (
              <button
                onClick={handleGenerateAnimatic}
                disabled={pages.length < 1}
                className="mt-3 flex w-full items-center justify-center gap-3 rounded-xl border border-[#8bc4c4]/55 bg-[#12384d]/60 px-6 py-4 font-display text-lg font-semibold text-[#eaf5f8] transition-all hover:border-[#add9d8] hover:bg-[#144258]/75 disabled:opacity-40"
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
              onClick={() => exportToPdf(pages, storyTitle || "DreamLoom Story", data.coverUrl, data.logline)}
              disabled={exporting}
              className="flex items-center gap-2 rounded-lg border border-[#8bc3c3]/55 bg-[#13384d]/55 px-4 py-2 font-body text-sm text-[#e7f3f5] transition-colors hover:bg-[#17445a]/70 disabled:opacity-40"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20" />
              </svg>
              {exporting ? "Exporting..." : "Storybook PDF"}
            </button>
            <button
              onClick={() => exportImages(pages, storyTitle || "DreamLoom Story")}
              disabled={exporting}
              className="flex items-center gap-2 rounded-lg border border-[#7fb7bc]/45 bg-[#1a465d]/45 px-4 py-2 font-body text-sm text-[#d0e5ea] transition-colors hover:bg-[#23536b]/55 disabled:opacity-40"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              {exporting ? "Exporting..." : "Export Images (.zip)"}
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
      <span className="font-body text-xs font-semibold uppercase tracking-widest text-[#b9dbe0]">
        {children}
      </span>
      <span className="h-px flex-1 bg-[#77adb8]/45" />
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
      className="text-[#f3dbc7]"
    >
      <path d="M20.2 6 3 11l-.9-2.4c-.3-1.1.3-2.2 1.3-2.5l13.5-4c1.1-.3 2.2.3 2.5 1.3Z" />
      <path d="m6.2 5.3 3.1 3.9" />
      <path d="m12.4 3.4 3.1 4" />
      <path d="M3 11h18v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
    </svg>
  );
}

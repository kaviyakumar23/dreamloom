/**
 * PublishButton — publish/unpublish a story to the public gallery.
 * Sits inside DirectorsCut alongside export buttons.
 */
import { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { DirectorsCutData, StoryPage } from "../types";
import { useGallery } from "../hooks/useGallery";

type Phase = "default" | "confirming" | "publishing" | "published";

interface PublishButtonProps {
  directorsCut: DirectorsCutData;
  pages: StoryPage[];
  storyTitle: string;
  storyGenre: string;
  storyStyle: string;
  userId: string;
  sessionId: string;
}

export function PublishButton({
  directorsCut,
  pages,
  storyTitle,
  storyGenre,
  storyStyle,
  userId,
  sessionId,
}: PublishButtonProps) {
  const { publishStory, unpublishStory, fetchMyPublished } = useGallery();
  const [phase, setPhase] = useState<Phase>("default");
  const [publishId, setPublishId] = useState<string | null>(null);

  // Check if already published on mount
  useEffect(() => {
    if (!userId || !sessionId) return;
    fetchMyPublished(userId).then((entries) => {
      const match = entries.find((e) => e.session_id === sessionId);
      if (match) {
        setPublishId(match.publish_id);
        setPhase("published");
      }
    });
  }, [userId, sessionId, fetchMyPublished]);

  const handlePublish = useCallback(async () => {
    setPhase("publishing");
    const scenes = pages.map((p) => p.blocks);
    const id = await publishStory({
      title: storyTitle,
      genre: storyGenre,
      style: storyStyle,
      logline: directorsCut.logline,
      cover_url: directorsCut.coverUrl,
      trailer_text: directorsCut.trailerText,
      scene_count: pages.length,
      scenes,
      scene_images: directorsCut.sceneImages,
      user_id: userId,
      session_id: sessionId,
    });
    if (id) {
      setPublishId(id);
      setPhase("published");
    } else {
      setPhase("default");
    }
  }, [publishStory, directorsCut, pages, storyTitle, storyGenre, storyStyle, userId, sessionId]);

  const handleUnpublish = useCallback(async () => {
    if (!publishId) return;
    const ok = await unpublishStory(publishId, userId);
    if (ok) {
      setPublishId(null);
      setPhase("default");
    }
  }, [unpublishStory, publishId, userId]);

  return (
    <AnimatePresence mode="wait">
      {phase === "default" && (
        <motion.button
          key="default"
          onClick={() => setPhase("confirming")}
          className="rounded-lg border border-dreamloom-gold/20 bg-dreamloom-gold/5 px-4 py-2 font-body text-sm text-dreamloom-gold transition-colors hover:bg-dreamloom-gold/15"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <span className="flex items-center gap-2">
            <GlobeIcon />
            Publish to Gallery
          </span>
        </motion.button>
      )}

      {phase === "confirming" && (
        <motion.div
          key="confirming"
          className="flex flex-col gap-2 rounded-lg border border-dreamloom-gold/20 bg-dreamloom-gold/5 p-3"
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 4 }}
        >
          <p className="font-body text-xs text-dreamloom-text/80">
            Share anonymously in the DreamLoom Gallery?
          </p>
          <div className="flex gap-2">
            <button
              onClick={handlePublish}
              className="rounded-md bg-dreamloom-gold px-3 py-1 font-body text-xs font-semibold text-dreamloom-bg transition-colors hover:bg-amber-400"
            >
              Publish
            </button>
            <button
              onClick={() => setPhase("default")}
              className="rounded-md border border-white/10 px-3 py-1 font-body text-xs text-dreamloom-text/70 transition-colors hover:bg-white/5"
            >
              Cancel
            </button>
          </div>
        </motion.div>
      )}

      {phase === "publishing" && (
        <motion.div
          key="publishing"
          className="flex items-center gap-2 rounded-lg border border-dreamloom-gold/20 bg-dreamloom-gold/5 px-4 py-2"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            className="h-4 w-4 rounded-full border-2 border-dreamloom-gold/30 border-t-dreamloom-gold"
            animate={{ rotate: 360 }}
            transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}
          />
          <span className="font-body text-xs text-dreamloom-gold">Publishing...</span>
        </motion.div>
      )}

      {phase === "published" && (
        <motion.div
          key="published"
          className="flex items-center gap-3"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <span className="flex items-center gap-1.5 rounded-lg border border-emerald-400/20 bg-emerald-400/10 px-3 py-2 font-body text-xs font-semibold text-emerald-400">
            <CheckIcon />
            Published
          </span>
          <button
            onClick={handleUnpublish}
            className="font-body text-xs text-dreamloom-muted underline transition-colors hover:text-red-400"
          >
            Unpublish
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function GlobeIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M2 12h20" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

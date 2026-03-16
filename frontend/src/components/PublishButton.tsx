/**
 * PublishButton — publish/unpublish a story to the public gallery.
 * Sits inside DirectorsCut alongside export buttons.
 */
import { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { DirectorsCutData, StoryPage } from "../types";
import { useGallery } from "../hooks/useGallery";

type Phase = "default" | "confirming" | "publishing" | "published" | "error";

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
  const [errorMsg, setErrorMsg] = useState("");

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
    setErrorMsg("");
    const scenes = pages.map((p) => p.blocks);
    const result = await publishStory({
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
    if (result.id) {
      setPublishId(result.id);
      setPhase("published");
    } else {
      setErrorMsg(result.error || "Publish failed");
      setPhase("error");
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
          className="rounded-lg border border-[#8bc3c3]/55 bg-[#13384d]/55 px-4 py-2 font-body text-sm text-[#e7f3f5] transition-colors hover:bg-[#17455a]/70"
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
          className="flex flex-col gap-2 rounded-lg border border-[#8bc3c3]/55 bg-[#13384d]/60 p-3"
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 4 }}
        >
          <p className="font-body text-xs text-[#e1f0f3]">
            Share anonymously in the DreamLoom Gallery?
          </p>
          <div className="flex gap-2">
            <button
              onClick={handlePublish}
              className="rounded-md bg-gradient-to-r from-dreamloom-accent to-dreamloom-gold px-3 py-1 font-body text-xs font-semibold text-white transition-colors hover:from-[#16838c] hover:to-[#ca7340]"
            >
              Publish
            </button>
            <button
              onClick={() => setPhase("default")}
              className="rounded-md border border-[#8cbfc1]/45 px-3 py-1 font-body text-xs text-[#cfe6ea] transition-colors hover:bg-[#214f63]/45"
            >
              Cancel
            </button>
          </div>
        </motion.div>
      )}

      {phase === "publishing" && (
        <motion.div
          key="publishing"
          className="flex items-center gap-2 rounded-lg border border-[#8bc3c3]/55 bg-[#13384d]/60 px-4 py-2"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            className="h-4 w-4 rounded-full border-2 border-dreamloom-gold/30 border-t-dreamloom-gold"
            animate={{ rotate: 360 }}
            transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}
          />
          <span className="font-body text-xs text-[#f2ddca]">Publishing...</span>
        </motion.div>
      )}

      {phase === "error" && (
        <motion.div
          key="error"
          className="flex flex-col gap-2 rounded-lg border border-red-400/20 bg-red-400/5 p-3"
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 4 }}
        >
          <p className="font-body text-xs text-red-400">{errorMsg}</p>
          <button
            onClick={() => setPhase("default")}
            className="self-start rounded-md border border-[#9ac4c6]/45 px-3 py-1 font-body text-xs text-[#cfe6ea] transition-colors hover:bg-[#214f63]/45"
          >
            Dismiss
          </button>
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
          <button onClick={handleUnpublish} className="font-body text-xs text-[#c9dee3] underline transition-colors hover:text-red-300">
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

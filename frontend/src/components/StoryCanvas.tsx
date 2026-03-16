/**
 * StoryCanvas — main story display area with cinematic design.
 * Shows story pages, streaming text, generation status, and global music player.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, Reorder } from "framer-motion";
import type { GenerationStatus, StoryPage as StoryPageType, StoryState } from "../types";
import { StoryPage } from "./StoryPage";
import { SceneSkeleton } from "./SceneSkeleton";
import { StoryTimeline } from "./StoryTimeline";

interface StoryCanvasProps {
  story: StoryState;
  agentSpeaking: boolean;
  generationStatus: GenerationStatus;
  isMicOn: boolean;
  onRegenerate?: (sceneNumber: number) => void;
  onDelete?: (sceneNumber: number) => void;
  onEditNarration?: (sceneId: string, blockIndex: number, content: string) => void;
  onReorder?: (sceneIds: string[]) => void;
  onBranch?: (sceneId: string) => void;
}

export function StoryCanvas({ story, agentSpeaking: _agentSpeaking, generationStatus, isMicOn, onRegenerate, onDelete, onEditNarration, onReorder, onBranch }: StoryCanvasProps) {
  void _agentSpeaking;
  const scrollRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Auto-scroll to bottom when new content appears
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [story.pages.length, story.currentText, generationStatus.active]);

  // Find the latest music URL — only play one at a time
  const currentMusic = useMemo(() => {
    for (let i = story.pages.length - 1; i >= 0; i--) {
      if (story.pages[i].musicUrl) {
        return {
          url: story.pages[i].musicUrl!,
          mood: story.pages[i].musicMood || "ambient",
        };
      }
    }
    return null;
  }, [story.pages]);

  // Track current music URL to avoid restarting on re-renders
  const currentMusicUrlRef = useRef<string>("");

  // Update global audio element when music changes
  useEffect(() => {
    if (!currentMusic) return;
    const audio = audioRef.current;
    if (!audio) return;
    if (currentMusicUrlRef.current !== currentMusic.url) {
      currentMusicUrlRef.current = currentMusic.url;
      audio.src = currentMusic.url;
      audio.volume = isMicOn ? 0.0 : 0.25;
      audio.load();
      audio.play().catch(() => {});
    }
  }, [currentMusic]);

  // Duck music volume when mic is active so it doesn't bleed into voice stream
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = isMicOn ? 0.0 : 0.25;
  }, [isMicOn]);

  const hasContent = story.pages.length > 0 || story.currentText;

  return (
    <div
      ref={scrollRef}
      role="main"
      id="main"
      className="relative flex-1 overflow-y-auto px-3 sm:px-4 py-6 sm:py-8"
    >
      {/* Generation status indicator — sticky at top */}
      <AnimatePresence>
        {generationStatus.active && (
          <motion.div
            className="sticky top-0 z-20 -mx-3 sm:-mx-4 px-3 sm:px-4 pt-1 pb-4"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
          >
            <div className="mx-auto max-w-2xl overflow-hidden rounded-xl border border-dreamloom-gold/30 bg-dreamloom-surface/90 backdrop-blur-lg shadow-lg shadow-dreamloom-gold/5">
              {/* Animated progress bar at top */}
              <motion.div
                className="h-1 bg-gradient-to-r from-dreamloom-gold via-[#d4a843] to-dreamloom-accent-light"
                initial={{ x: "-100%" }}
                animate={{ x: "100%" }}
                transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
              />
              <div className="flex items-center gap-4 p-4">
                {/* Animated spinner */}
                <div className="relative h-10 w-10 flex-shrink-0">
                  <motion.div
                    className="absolute inset-0 rounded-full border-2 border-dreamloom-gold/20"
                  />
                  <motion.div
                    className="absolute inset-0 rounded-full border-2 border-t-dreamloom-gold border-r-transparent border-b-transparent border-l-transparent"
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1.2, repeat: Infinity, ease: "linear" }}
                  />
                  <div className="absolute inset-2 flex items-center justify-center">
                    <PaintbrushIcon />
                  </div>
                </div>
                <div className="flex-1">
                  <p className="font-display text-base font-semibold text-dreamloom-gold">
                    {generationStatus.message || "Processing..."}
                  </p>
                  <GenerationSteps />
                </div>
                <GenerationTimer active={generationStatus.active} />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Story title */}
      <AnimatePresence>
        {story.title && (
          <motion.div
            className="mx-auto mb-10 max-w-2xl text-center"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            <h1 className="mb-3 font-display text-2xl sm:text-4xl md:text-5xl font-bold bg-gradient-to-b from-white to-[#d4c4a8] bg-clip-text text-transparent">
              {story.title}
            </h1>
            {story.genre && (
              <span className="rounded-full border border-dreamloom-gold/30 bg-dreamloom-gold/10 px-4 py-1 font-body text-sm text-dreamloom-gold">
                {story.genre}
              </span>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Story arc timeline */}
      <StoryTimeline pages={story.pages} />

      {/* Story pages — drag-to-reorder */}
      <Reorder.Group
        axis="y"
        values={story.pages}
        onReorder={(newPages: StoryPageType[]) => {
          if (onReorder) {
            onReorder(newPages.map((p) => p.sceneId));
          }
        }}
        className="relative"
      >
        <AnimatePresence mode="popLayout">
          {story.pages.map((page, i) => (
            <Reorder.Item
              key={page.sceneId}
              value={page}
              className="cursor-grab active:cursor-grabbing"
              data-scene={page.sceneNumber}
            >
              <StoryPage
                page={page}
                isLatest={i === story.pages.length - 1}
                onRegenerate={onRegenerate}
                onDelete={onDelete}
                onEditNarration={onEditNarration}
                onBranch={onBranch}
              />
            </Reorder.Item>
          ))}
        </AnimatePresence>
      </Reorder.Group>

      {/* Loading skeleton during generation */}
      {generationStatus.active && <SceneSkeleton />}

      {/* Empty state */}
      {!hasContent && !generationStatus.active && (
        <div className="flex h-full items-center justify-center">
          <motion.div
            className="text-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
          >
            <p className="font-display text-2xl italic text-dreamloom-text/70">
              Start speaking to begin your story...
            </p>
            <p className="mt-3 font-body text-base text-dreamloom-muted">
              Tell Loom about the world you want to create
            </p>
          </motion.div>
        </div>
      )}

      {/* Global music player */}
      {currentMusic && (
        <div className="sticky bottom-0 z-10 mx-auto max-w-2xl pt-4">
          <motion.div
            className="flex items-center gap-3 rounded-xl border border-dreamloom-gold/20 bg-dreamloom-surface/90 px-4 py-3 backdrop-blur-lg shadow-lg"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <MusicNoteIcon />
            <span className="font-body text-sm font-medium text-dreamloom-gold">
              {currentMusic.mood}
            </span>
            <audio
              ref={audioRef}
              controls
              loop
              className="h-8 flex-1"
            />
          </motion.div>
        </div>
      )}
    </div>
  );
}

function PaintbrushIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-dreamloom-gold"
    >
      <path d="m9.06 11.9 8.07-8.06a2.85 2.85 0 1 1 4.03 4.03l-8.06 8.08" />
      <path d="M7.07 14.94c-1.66 0-3 1.35-3 3.02 0 1.33-2.5 1.52-2 2.02 1.08 1.1 2.49 2.02 4 2.02 2.2 0 4-1.8 4-4.04a3.01 3.01 0 0 0-3-3.02z" />
    </svg>
  );
}

function MusicNoteIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-dreamloom-gold"
    >
      <path d="M9 18V5l12-2v13" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="18" cy="16" r="3" />
    </svg>
  );
}

/** Elapsed timer shown during scene generation. */
function GenerationTimer({ active }: { active: boolean }) {
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef(Date.now());

  useEffect(() => {
    if (!active) {
      setElapsed(0);
      return;
    }
    startRef.current = Date.now();
    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startRef.current) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [active]);

  return (
    <span className="tabular-nums font-mono text-sm text-dreamloom-muted">
      {elapsed}s
    </span>
  );
}

/** Animated step indicators that progress over time. */
function GenerationSteps() {
  const [step, setStep] = useState(0);
  const steps = ["Composing narrative...", "Painting illustrations...", "Weaving together..."];

  useEffect(() => {
    const id = setInterval(() => {
      setStep((s) => (s + 1) % steps.length);
    }, 5000);
    return () => clearInterval(id);
  }, []);

  return (
    <p className="mt-0.5 font-body text-sm text-dreamloom-muted">
      {steps[step]}
    </p>
  );
}

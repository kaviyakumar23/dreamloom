/**
 * CinematicPlayer — fullscreen cinematic trailer player.
 * Auto-plays through story scenes with Ken Burns, crossfade transitions,
 * AI-generated narration (Gemini TTS), and background music.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import type { StoryPage } from "../types";
import { fetchTTSBatch } from "../services/tts";

interface CinematicPlayerProps {
  pages: StoryPage[];
  musicUrls?: (string | undefined)[];
  storyTitle: string;
  onClose: () => void;
}

type Phase = "loading" | "title" | `scene-${number}` | "end" | "done";

interface SceneData {
  imageUrl: string;
  title: string;
  subtitle: string;
  musicUrl?: string;
  kenBurns: { scale: number; x: number; y: number };
}

const SCENE_DURATION = 6000; // ms per scene (minimum)
const TITLE_DURATION = 4000;
const END_DURATION = 3000;
const CROSSFADE_MS = 800;

function randomKenBurns() {
  // Gentle effect so the main scene stays clearly visible
  const scale = 1.02 + Math.random() * 0.04; // 1.02–1.06
  const angle = Math.random() * Math.PI * 2;
  const dist = 0.3 + Math.random() * 0.7; // 0.3–1% translate
  return {
    scale,
    x: Math.cos(angle) * dist,
    y: Math.sin(angle) * dist,
  };
}

export function CinematicPlayer({ pages, musicUrls = [], storyTitle, onClose }: CinematicPlayerProps) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [playing, setPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);
  const pausedAtRef = useRef<number>(0);
  const audioCtxRef = useRef<AudioContext | null>(null);
  // Per-scene music state
  const musicAudiosRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const currentMusicUrlRef = useRef<string>("");
  const _musicGainRef = useRef<GainNode | null>(null); void _musicGainRef;

  // Narration audio elements — one per scene
  const narrationAudiosRef = useRef<(HTMLAudioElement | null)[]>([]);
  const lastNarrationIdxRef = useRef(-1);

  // Extract scene data from pages
  const scenes: SceneData[] = useMemo(() => {
    let sceneIdx = 0;
    return pages
      .map((page) => {
        let imgUrl = page.imageUrl;
        if (!imgUrl) {
          for (const block of page.blocks) {
            if (block.type === "image" && block.url) {
              imgUrl = block.url;
              break;
            }
          }
        }
        if (!imgUrl) return null;

        const narrationText =
          page.narration ||
          page.blocks
            .filter((b) => b.type === "text")
            .map((b) => b.content)
            .join(" ");
        const subtitle =
          narrationText.length > 150
            ? narrationText.slice(0, 147) + "..."
            : narrationText;

        const result: SceneData = {
          imageUrl: imgUrl,
          title: page.title || `Scene ${page.sceneNumber}`,
          subtitle,
          musicUrl: musicUrls[sceneIdx] || page.musicUrl,
          kenBurns: randomKenBurns(),
        };
        sceneIdx++;
        return result;
      })
      .filter((s): s is SceneData => s !== null);
  }, [pages, musicUrls]);

  const totalDuration = TITLE_DURATION + scenes.length * SCENE_DURATION + END_DURATION;

  // ── Fetch AI narration on mount ──
  useEffect(() => {
    let cancelled = false;
    let started = false;
    const subtitles = scenes.map((s) => s.subtitle);

    const startPlayer = () => {
      if (started || cancelled) return;
      started = true;
      setPhase("title");
      setPlaying(true);
    };

    // Fallback: start anyway after 20s even if TTS is still loading
    const fallbackTimer = setTimeout(() => {
      if (!started && !cancelled) {
        narrationAudiosRef.current = subtitles.map(() => null);
        startPlayer();
      }
    }, 20000);

    fetchTTSBatch(subtitles).then((wavBuffers) => {
      clearTimeout(fallbackTimer);
      if (cancelled) return;

      const audios: (HTMLAudioElement | null)[] = wavBuffers.map((buf) => {
        if (!buf) return null;
        const blob = new Blob([buf], { type: "audio/wav" });
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audio.volume = 0.9;
        return audio;
      });

      narrationAudiosRef.current = audios;
      startPlayer();
    });

    return () => {
      cancelled = true;
      clearTimeout(fallbackTimer);
      // Revoke blob URLs
      narrationAudiosRef.current.forEach((a) => {
        if (a) {
          a.pause();
          URL.revokeObjectURL(a.src);
        }
      });
    };
  }, [scenes]);

  // Compute current phase from elapsed time
  const computePhase = useCallback(
    (ms: number): Phase => {
      if (ms < TITLE_DURATION) return "title";
      const afterTitle = ms - TITLE_DURATION;
      const sceneIdx = Math.floor(afterTitle / SCENE_DURATION);
      if (sceneIdx < scenes.length) return `scene-${sceneIdx}`;
      const afterScenes = afterTitle - scenes.length * SCENE_DURATION;
      if (afterScenes < END_DURATION) return "end";
      return "done";
    },
    [scenes.length],
  );

  const currentSceneIndex = phase.startsWith("scene-")
    ? parseInt(phase.split("-")[1])
    : -1;

  // Animation loop
  useEffect(() => {
    if (!playing || phase === "loading") return;

    startTimeRef.current = performance.now() - pausedAtRef.current;

    const tick = () => {
      const now = performance.now();
      const ms = now - startTimeRef.current;
      setElapsed(ms);
      const newPhase = computePhase(ms);
      setPhase(newPhase);

      if (newPhase === "done") {
        setPlaying(false);
        return;
      }
      timerRef.current = requestAnimationFrame(tick);
    };

    timerRef.current = requestAnimationFrame(tick);
    return () => {
      if (timerRef.current) cancelAnimationFrame(timerRef.current);
    };
  }, [playing, computePhase, phase]);

  // ── Narration playback — start/stop when scene changes ──
  useEffect(() => {
    const audios = narrationAudiosRef.current;

    if (!playing || !phase.startsWith("scene-")) {
      // Pause current narration
      const prev = lastNarrationIdxRef.current;
      if (prev >= 0 && audios[prev]) {
        audios[prev]!.pause();
      }
      if (!phase.startsWith("scene-")) {
        lastNarrationIdxRef.current = -1;
      }
      return;
    }

    const idx = parseInt(phase.split("-")[1]);
    if (idx === lastNarrationIdxRef.current) return; // same scene

    // Stop previous
    const prev = lastNarrationIdxRef.current;
    if (prev >= 0 && audios[prev]) {
      audios[prev]!.pause();
      audios[prev]!.currentTime = 0;
    }

    // Start new
    lastNarrationIdxRef.current = idx;
    const audio = audios[idx];
    if (audio) {
      audio.currentTime = 0;
      // Duck current scene's music while narration plays
      const sceneMusic = scenes[idx]?.musicUrl
        ? musicAudiosRef.current.get(scenes[idx].musicUrl!)
        : null;
      if (sceneMusic) sceneMusic.volume = 0.1;
      audio.play().catch(() => {});
      audio.onended = () => {
        if (sceneMusic) sceneMusic.volume = 0.3;
      };
    }
  }, [phase, playing, scenes]);

  // Pause handling
  const togglePlay = useCallback(() => {
    if (phase === "done") {
      pausedAtRef.current = 0;
      setElapsed(0);
      setPhase("title");
      lastNarrationIdxRef.current = -1;
      setPlaying(true);
      return;
    }
    if (playing) {
      pausedAtRef.current = elapsed;
      setPlaying(false);
    } else {
      setPlaying(true);
    }
  }, [playing, phase, elapsed]);

  // Skip scene
  const skipForward = useCallback(() => {
    let target: number;
    if (phase === "title") {
      target = TITLE_DURATION;
    } else if (phase.startsWith("scene-")) {
      const idx = parseInt(phase.split("-")[1]);
      target = TITLE_DURATION + (idx + 1) * SCENE_DURATION;
    } else {
      return;
    }
    pausedAtRef.current = Math.min(target, totalDuration);
    setElapsed(pausedAtRef.current);
    setPhase(computePhase(pausedAtRef.current));
    if (!playing) {
      startTimeRef.current = performance.now() - pausedAtRef.current;
    }
  }, [phase, playing, totalDuration, computePhase]);

  const skipBackward = useCallback(() => {
    let target: number;
    if (phase === "title") {
      target = 0;
    } else if (phase.startsWith("scene-")) {
      const idx = parseInt(phase.split("-")[1]);
      target = idx > 0 ? TITLE_DURATION + (idx - 1) * SCENE_DURATION : 0;
    } else if (phase === "end") {
      target = TITLE_DURATION + Math.max(0, scenes.length - 1) * SCENE_DURATION;
    } else {
      return;
    }
    pausedAtRef.current = target;
    setElapsed(target);
    setPhase(computePhase(target));
    if (!playing) {
      startTimeRef.current = performance.now() - pausedAtRef.current;
    }
  }, [phase, playing, scenes.length, computePhase]);

  // Keyboard controls
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === " " || e.code === "Space") {
        e.preventDefault();
        togglePlay();
      } else if (e.key === "ArrowRight") skipForward();
      else if (e.key === "ArrowLeft") skipBackward();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose, togglePlay, skipForward, skipBackward]);

  // Pre-load all unique music URLs on mount
  useEffect(() => {
    const urls = new Set(scenes.map((s) => s.musicUrl).filter(Boolean) as string[]);
    const map = new Map<string, HTMLAudioElement>();
    urls.forEach((url) => {
      const audio = new Audio(url);
      audio.loop = true;
      audio.crossOrigin = "anonymous";
      audio.volume = 0.3;
      map.set(url, audio);
    });
    musicAudiosRef.current = map;
    // Create shared AudioContext for music gain control
    if (urls.size > 0 && !audioCtxRef.current) {
      audioCtxRef.current = new AudioContext();
    }
    return () => {
      map.forEach((audio) => {
        audio.pause();
        audio.src = "";
      });
      audioCtxRef.current?.close().catch(() => {});
      audioCtxRef.current = null;
    };
  }, [scenes]);

  // Switch music per scene with crossfade
  useEffect(() => {
    if (!playing) {
      // Pause all music when paused
      musicAudiosRef.current.forEach((audio) => audio.pause());
      return;
    }

    const sceneIdx = phase.startsWith("scene-") ? parseInt(phase.split("-")[1]) : -1;
    const targetUrl = sceneIdx >= 0 && sceneIdx < scenes.length
      ? scenes[sceneIdx].musicUrl || ""
      : "";

    if (targetUrl === currentMusicUrlRef.current) return;

    // Fade out current
    const prevUrl = currentMusicUrlRef.current;
    if (prevUrl) {
      const prevAudio = musicAudiosRef.current.get(prevUrl);
      if (prevAudio) {
        // Simple volume ramp down
        const startVol = prevAudio.volume;
        const fadeOut = setInterval(() => {
          prevAudio.volume = Math.max(0, prevAudio.volume - startVol / 10);
          if (prevAudio.volume <= 0) {
            clearInterval(fadeOut);
            prevAudio.pause();
            prevAudio.volume = 0.3; // reset for next use
          }
        }, 50);
      }
    }

    currentMusicUrlRef.current = targetUrl;

    // Fade in new
    if (targetUrl) {
      const newAudio = musicAudiosRef.current.get(targetUrl);
      if (newAudio) {
        newAudio.volume = 0;
        newAudio.play().catch(() => {});
        const fadeIn = setInterval(() => {
          newAudio.volume = Math.min(0.3, newAudio.volume + 0.03);
          if (newAudio.volume >= 0.3) clearInterval(fadeIn);
        }, 50);
      }
    }
  }, [phase, playing, scenes]);

  // Progress bar percentage
  const progressPct = Math.min((elapsed / totalDuration) * 100, 100);

  // Compute scene-local progress for Ken Burns timing
  const sceneLocalProgress = (() => {
    if (!phase.startsWith("scene-")) return 0;
    const idx = parseInt(phase.split("-")[1]);
    const sceneStart = TITLE_DURATION + idx * SCENE_DURATION;
    return Math.min((elapsed - sceneStart) / SCENE_DURATION, 1);
  })();

  return createPortal(
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-label="Cinematic trailer player"
      className="fixed inset-0 z-[200] flex flex-col bg-[#0a0a1a]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
    >
      {/* Film grain overlay */}
      <div className="film-grain pointer-events-none absolute inset-0 z-10" />

      {/* Top letterbox bar */}
      <div className="h-[30px] w-full shrink-0 bg-black sm:h-[50px]" />

      {/* Main content area */}
      <div className="relative flex-1 overflow-hidden">
        <AnimatePresence mode="sync">
          {/* ── Loading state ── */}
          {phase === "loading" && (
            <motion.div
              key="loading"
              className="absolute inset-0 flex flex-col items-center justify-center gap-4"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-amber-500/30 border-t-amber-500" />
              <p className="font-body text-sm text-white/50">
                Generating narration...
              </p>
            </motion.div>
          )}

          {/* ── Title card ── */}
          {phase === "title" && (
            <motion.div
              key="title"
              className="absolute inset-0 flex flex-col items-center justify-center"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: CROSSFADE_MS / 1000 }}
            >
              <motion.div
                className="mx-auto h-px bg-gradient-to-r from-transparent via-amber-500/50 to-transparent"
                initial={{ width: 0 }}
                animate={{ width: "30%" }}
                transition={{ duration: 1.5, ease: "easeOut" }}
              />
              <motion.h1
                className="mt-6 px-8 text-center font-display text-3xl font-bold text-amber-400 sm:text-5xl md:text-6xl"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5, duration: 0.8 }}
                style={{ textShadow: "0 4px 20px rgba(0,0,0,0.8)" }}
              >
                {storyTitle}
              </motion.h1>
              <motion.p
                className="mt-4 font-body text-lg text-white/50"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1.2, duration: 0.8 }}
              >
                A story woven by voice and imagination
              </motion.p>
            </motion.div>
          )}

          {/* ── Scene cards ── */}
          {phase.startsWith("scene-") && currentSceneIndex >= 0 && currentSceneIndex < scenes.length && (
            <motion.div
              key={phase}
              className="absolute inset-0"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: CROSSFADE_MS / 1000 }}
            >
              {/* Ken Burns image */}
              <div className="absolute inset-0 overflow-hidden">
                <img
                  src={scenes[currentSceneIndex].imageUrl}
                  alt={scenes[currentSceneIndex].title}
                  className="h-full w-full object-cover"
                  style={{
                    transition: `transform ${SCENE_DURATION}ms ease-out`,
                    transform: sceneLocalProgress < 0.05
                      ? "scale(1) translate(0%, 0%)"
                      : `scale(${scenes[currentSceneIndex].kenBurns.scale}) translate(${scenes[currentSceneIndex].kenBurns.x}%, ${scenes[currentSceneIndex].kenBurns.y}%)`,
                  }}
                />
              </div>

              {/* Scene title badge */}
              <motion.div
                className="absolute left-3 top-3 z-20 sm:left-6 sm:top-4"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.8, duration: 0.5 }}
              >
                <span className="rounded-full border border-amber-500/40 bg-black/60 px-4 py-1.5 font-display text-sm font-semibold text-amber-400 backdrop-blur-sm">
                  {scenes[currentSceneIndex].title}
                </span>
              </motion.div>

              {/* Bottom gradient + subtitle */}
              <div className="absolute inset-x-0 bottom-0 z-20">
                <div className="h-40 bg-gradient-to-t from-black/80 to-transparent" />
                {scenes[currentSceneIndex].subtitle && (
                  <motion.div
                    className="absolute inset-x-0 bottom-4 px-8 text-center sm:px-16"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 1.2, duration: 0.6 }}
                  >
                    <p
                      className="mx-auto max-w-3xl font-body text-lg leading-relaxed text-white/90 sm:text-xl"
                      style={{ textShadow: "0 2px 12px rgba(0,0,0,0.9)" }}
                    >
                      {scenes[currentSceneIndex].subtitle}
                    </p>
                  </motion.div>
                )}
              </div>
            </motion.div>
          )}

          {/* ── End card ── */}
          {(phase === "end" || phase === "done") && (
            <motion.div
              key="end"
              className="absolute inset-0 flex flex-col items-center justify-center"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: CROSSFADE_MS / 1000 }}
            >
              <motion.h2
                className="font-display text-4xl font-bold text-amber-400"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.8 }}
                style={{ textShadow: "0 4px 20px rgba(0,0,0,0.8)" }}
              >
                The End
              </motion.h2>
              <motion.p
                className="mt-3 font-body text-base text-white/40"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.6, duration: 0.6 }}
              >
                {scenes.length} scene{scenes.length !== 1 ? "s" : ""} woven by DreamLoom
              </motion.p>
              {phase === "done" && (
                <motion.button
                  className="mt-8 rounded-full border border-amber-500/30 bg-amber-500/10 px-6 py-2.5 font-display text-sm font-semibold text-amber-400 transition-colors hover:bg-amber-500/20"
                  onClick={togglePlay}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 1 }}
                >
                  Replay
                </motion.button>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Bottom letterbox bar */}
      <div className="h-[30px] w-full shrink-0 bg-black sm:h-[50px]" />

      {/* Controls overlay — hide during loading */}
      {phase !== "loading" && (
        <div className="absolute inset-0 z-30 flex items-center justify-center">
          <div className="flex items-center gap-6">
            <button
              onClick={skipBackward}
              className="rounded-full bg-white/10 p-3 text-white/70 backdrop-blur-sm transition-colors hover:bg-white/20 hover:text-white"
              aria-label="Previous scene"
            >
              <SkipBackIcon />
            </button>
            <button
              onClick={togglePlay}
              className="rounded-full bg-white/15 p-5 text-white/80 backdrop-blur-sm transition-colors hover:bg-white/25 hover:text-white"
              aria-label={playing ? "Pause" : "Play"}
            >
              {playing ? <PauseIcon /> : phase === "done" ? <ReplayIcon /> : <PlayIcon />}
            </button>
            <button
              onClick={skipForward}
              className="rounded-full bg-white/10 p-3 text-white/70 backdrop-blur-sm transition-colors hover:bg-white/20 hover:text-white"
              aria-label="Next scene"
            >
              <SkipForwardIcon />
            </button>
          </div>
        </div>
      )}

      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute right-3 top-3 z-40 rounded-full bg-white/10 p-2.5 text-white/70 backdrop-blur-sm transition-colors hover:bg-white/20 hover:text-white sm:right-4 sm:top-4"
        aria-label="Close player"
      >
        <CloseIcon />
      </button>

      {/* Progress bar */}
      <div className="absolute inset-x-0 bottom-0 z-40 h-1 bg-white/10">
        <motion.div
          className="h-full bg-amber-500"
          style={{ width: `${progressPct}%` }}
          transition={{ duration: 0.1 }}
        />
      </div>
    </motion.div>,
    document.body,
  );
}

// ── Icon components ──

function PlayIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
      <path d="M6 4h4v16H6zM14 4h4v16h-4z" />
    </svg>
  );
}

function ReplayIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
      <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
      <path d="M16 16h5v5" />
    </svg>
  );
}

function SkipBackIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <path d="M6 6h2v12H6zm3.5 6 8.5 6V6z" />
    </svg>
  );
}

function SkipForwardIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <path d="M16 6h2v12h-2zM4 18l8.5-6L4 6z" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

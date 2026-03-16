/**
 * StoryTimeline — horizontal story arc visualization with mood-colored dots.
 */
import { motion } from "framer-motion";
import type { StoryPage } from "../types";

interface StoryTimelineProps {
  pages: StoryPage[];
}

const MOOD_COLORS: Record<string, string> = {
  joy: "bg-amber-400",
  wonder: "bg-amber-400",
  mystery: "bg-violet-400",
  tension: "bg-red-400",
  danger: "bg-red-400",
  calm: "bg-sky-400",
  peace: "bg-sky-400",
  adventure: "bg-emerald-400",
  excitement: "bg-emerald-400",
};

function getMoodColor(mood?: string): string {
  if (!mood) return "bg-dreamloom-gold";
  const lower = mood.toLowerCase();
  for (const [key, color] of Object.entries(MOOD_COLORS)) {
    if (lower.includes(key)) return color;
  }
  return "bg-dreamloom-gold";
}

export function StoryTimeline({ pages }: StoryTimelineProps) {
  if (pages.length < 2) return null;

  const scrollToScene = (sceneNumber: number) => {
    const el = document.querySelector(`[data-scene="${sceneNumber}"]`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  return (
    <div className="mx-auto mb-8 max-w-2xl px-4">
      <div className="flex items-center">
        {pages.map((page, i) => (
          <div key={page.sceneId} className="flex flex-1 items-center">
            {/* Connecting line (before dot, except first) */}
            {i > 0 && (
              <div className="h-0.5 flex-1 bg-[#9fc8c4]/45" />
            )}

            {/* Dot */}
            <motion.button
              onClick={() => scrollToScene(page.sceneNumber)}
              className={`relative h-3.5 w-3.5 flex-shrink-0 rounded-full ${getMoodColor(page.musicMood)} transition-colors`}
              whileHover={{ scale: 1.3 }}
              whileTap={{ scale: 0.9 }}
              title={`Scene ${page.sceneNumber}: ${page.title || "Untitled"}`}
            >
              {/* Pulse ring on latest */}
              {i === pages.length - 1 && (
                <motion.div
                  className={`absolute inset-0 rounded-full ${getMoodColor(page.musicMood)}`}
                  animate={{ scale: [1, 1.8], opacity: [0.5, 0] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                />
              )}
            </motion.button>
          </div>
        ))}
      </div>
    </div>
  );
}

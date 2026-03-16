/**
 * TypewriterText — streaming text display with typewriter animation.
 */
import { motion } from "framer-motion";

/** Strip common markdown formatting from model output. */
export function stripMarkdown(text: string): string {
  return text
    .replace(/^#{1,6}\s+/gm, "")      // # headers
    .replace(/\*\*(.+?)\*\*/g, "$1")   // **bold**
    .replace(/__(.+?)__/g, "$1")       // __bold__
    .replace(/\*(.+?)\*/g, "$1")       // *italic*
    .replace(/_(.+?)_/g, "$1")         // _italic_
    .replace(/~~(.+?)~~/g, "$1")       // ~~strikethrough~~
    .replace(/`(.+?)`/g, "$1")         // `code`
    .replace(/^\s*[-*+]\s+/gm, "")     // - list items
    .replace(/^\s*\d+\.\s+/gm, "")     // 1. numbered lists
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // [links](url)
    .replace(/\n{3,}/g, "\n\n")        // collapse triple+ newlines
    .trim();
}

interface TypewriterTextProps {
  text: string;
  className?: string;
}

export function TypewriterText({ text, className = "" }: TypewriterTextProps) {
  if (!text) return null;

  const cleaned = stripMarkdown(text);

  return (
    <motion.div
      className={`leading-relaxed ${className}`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      {cleaned.split("").map((char, i) => (
        <motion.span
          key={i}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{
            duration: 0.02,
            delay: i * 0.015,
          }}
        >
          {char}
        </motion.span>
      ))}
    </motion.div>
  );
}

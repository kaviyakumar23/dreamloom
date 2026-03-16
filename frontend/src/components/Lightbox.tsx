/**
 * Lightbox — fullscreen image overlay with shared-layout transition.
 * Renders as a React portal into document.body.
 */
import { useEffect } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";

interface LightboxProps {
  imageUrl: string;
  alt?: string;
  layoutId?: string;
  onClose: () => void;
}

export function Lightbox({ imageUrl, alt = "Story illustration", layoutId, onClose }: LightboxProps) {
  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return createPortal(
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-label="Image fullscreen view"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-[#0a1d2a]/88"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute right-4 top-4 z-10 rounded-full border border-[#8bb7bf]/45 bg-[#0e2e41]/80 p-2 text-[#e4f4f6] transition-colors hover:bg-[#16455f]"
        aria-label="Close fullscreen"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>

      <motion.img
        layoutId={layoutId}
        src={imageUrl}
        alt={alt}
        className="max-h-[90vh] max-w-[90vw] rounded-xl object-contain shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      />
    </motion.div>,
    document.body
  );
}

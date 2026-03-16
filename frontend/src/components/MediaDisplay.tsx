/**
 * MediaDisplay — cinematic image reveal with blur-in animation and lightbox.
 */
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Lightbox } from "./Lightbox";

interface MediaDisplayProps {
  imageUrl?: string;
  alt?: string;
  className?: string;
  onImageError?: (e: React.SyntheticEvent<HTMLImageElement>) => void;
}

export function MediaDisplay({
  imageUrl,
  alt = "Story illustration",
  className = "",
  onImageError,
}: MediaDisplayProps) {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const layoutId = imageUrl ? `media-${imageUrl}` : undefined;

  if (!imageUrl) return null;

  return (
    <>
      <motion.div
        className={`relative cursor-pointer overflow-hidden rounded-xl border border-white/5 ${className}`}
        initial={{ opacity: 0, scale: 0.95, filter: "blur(20px)" }}
        animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        onClick={() => setLightboxOpen(true)}
        aria-label="View fullscreen"
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === "Enter") setLightboxOpen(true); }}
      >
        <motion.img
          layoutId={layoutId}
          src={imageUrl}
          alt={alt}
          className="w-full rounded-xl shadow-2xl"
          loading="eager"
          onError={onImageError}
        />

        {/* Cinematic vignette overlay */}
        <div className="pointer-events-none absolute inset-0 rounded-xl shadow-[inset_0_0_80px_rgba(0,0,0,0.4)]" />
      </motion.div>

      <AnimatePresence>
        {lightboxOpen && (
          <Lightbox
            imageUrl={imageUrl}
            alt={alt}
            layoutId={layoutId}
            onClose={() => setLightboxOpen(false)}
          />
        )}
      </AnimatePresence>
    </>
  );
}

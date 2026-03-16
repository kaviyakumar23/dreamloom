/**
 * StoryPage — individual story page with interleaved text+image blocks.
 * Cinematic design with warm gold accents and display typography.
 */
import { memo, useCallback, useRef, useState } from "react";
import { motion } from "framer-motion";
import type { StoryPage as StoryPageData, InterleavedBlock } from "../types";
import { MediaDisplay } from "./MediaDisplay";
import { TypewriterText, stripMarkdown } from "./TypewriterText";

interface StoryPageProps {
  page: StoryPageData;
  isLatest: boolean;
  onRegenerate?: (sceneNumber: number) => void;
  onDelete?: (sceneNumber: number) => void;
  onEditNarration?: (sceneId: string, blockIndex: number, content: string) => void;
  onBranch?: (sceneId: string) => void;
}

function StoryPageBlock({
  block,
  index,
  isLatest,
  sceneId,
  onEdit,
}: {
  block: InterleavedBlock;
  index: number;
  isLatest: boolean;
  sceneId?: string;
  onEdit?: (sceneId: string, blockIndex: number, content: string) => void;
}) {
  const delay = isLatest ? index * 0.2 : 0;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const startEdit = useCallback(() => {
    if (!block.content || !onEdit || !sceneId) return;
    setDraft(stripMarkdown(block.content));
    setEditing(true);
  }, [block.content, onEdit, sceneId]);

  const saveEdit = useCallback(() => {
    if (onEdit && sceneId && draft.trim() && draft !== stripMarkdown(block.content || "")) {
      onEdit(sceneId, index, draft.trim());
    }
    setEditing(false);
  }, [onEdit, sceneId, index, draft, block.content]);

  const cancelEdit = useCallback(() => {
    setEditing(false);
  }, []);

  if (block.type === "text" && block.content) {
    return (
      <motion.div
        className="group/text relative rounded-xl border border-[#9fc8c5]/55 bg-[#f6fcfb]/86 p-4 backdrop-blur-sm sm:p-6"
        initial={isLatest ? { opacity: 0, y: 20 } : false}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay }}
        onDoubleClick={startEdit}
      >
        {editing ? (
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={saveEdit}
            onKeyDown={(e) => {
              if (e.key === "Escape") cancelEdit();
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) saveEdit();
            }}
            autoFocus
            className="w-full resize-none bg-transparent font-body text-base sm:text-lg leading-relaxed text-dreamloom-text outline-none"
            rows={Math.max(3, draft.split("\n").length)}
          />
        ) : (
          <>
            {isLatest ? (
              <TypewriterText
                text={block.content}
                className="font-body text-base sm:text-lg text-dreamloom-text"
              />
            ) : (
              <p className="font-body text-base sm:text-lg leading-relaxed text-dreamloom-text">
                {stripMarkdown(block.content)}
              </p>
            )}
            {onEdit && sceneId && (
              <button
                onClick={startEdit}
                className="absolute right-3 top-3 rounded-md p-1 text-transparent transition-colors group-hover/text:text-dreamloom-muted hover:!text-dreamloom-gold"
                title="Edit text (double-click)"
              >
                <PencilIcon />
              </button>
            )}
          </>
        )}
      </motion.div>
    );
  }

  if (block.type === "image" && block.url) {
    return (
      <motion.div
        initial={isLatest ? { opacity: 0, scale: 0.95 } : false}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.6, delay }}
      >
        <MediaDisplay
          imageUrl={block.url}
          alt={`Scene illustration ${index + 1}`}
          onImageError={(e) => {
            (e.target as HTMLImageElement).src =
              "data:image/svg+xml," +
              encodeURIComponent(
                '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300">' +
                '<rect width="400" height="300" fill="#1a1a2e"/>' +
                '<text x="200" y="140" text-anchor="middle" fill="#666" font-family="sans-serif" font-size="16">Image unavailable</text>' +
                '<text x="200" y="170" text-anchor="middle" fill="#555" font-family="sans-serif" font-size="12">The illustration could not be loaded</text>' +
                '</svg>'
              );
          }}
        />
      </motion.div>
    );
  }

  return null;
}

const REACTION_EMOJIS = [
  { key: "applause", emoji: "\uD83D\uDC4F", label: "Applause" },
  { key: "love", emoji: "\u2764\uFE0F", label: "Love" },
  { key: "surprise", emoji: "\uD83D\uDE2E", label: "Surprise" },
  { key: "laugh", emoji: "\uD83D\uDE02", label: "Laugh" },
] as const;

export const StoryPage = memo(function StoryPage({ page, isLatest, onRegenerate, onDelete, onEditNarration, onBranch }: StoryPageProps) {
  const hasBlocks = page.blocks && page.blocks.length > 0;
  const [reactions, setReactions] = useState<Record<string, number>>({});

  const toggleReaction = (key: string) => {
    setReactions((prev) => ({ ...prev, [key]: (prev[key] || 0) + 1 }));
  };

  return (
    <motion.div
      role="article"
      className="group mx-auto mb-8 sm:mb-12 max-w-2xl"
      initial={{ opacity: 0, y: 40 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: "easeOut" }}
    >
      {/* Scene header */}
      <motion.div
        className="mb-4 flex items-center gap-3"
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 0.2 }}
      >
        <span className="rounded-full border border-dreamloom-gold/40 bg-dreamloom-gold/12 px-3 py-1 font-body text-sm font-medium text-[#a05d2f]">
          Scene {page.sceneNumber}
        </span>
        {page.branchLabel && (
          <span className="rounded-full border border-violet-400/30 bg-violet-400/10 px-2 py-0.5 font-body text-xs font-medium text-violet-400">
            {page.branchLabel}
          </span>
        )}
        {page.title && (
          <span className="font-display text-base font-medium italic text-dreamloom-text/85">
            {page.title}
          </span>
        )}
        {isLatest && (
          <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-dreamloom-gold" />
        )}
      </motion.div>

      {/* Interleaved blocks */}
      {hasBlocks ? (
        <div className="space-y-4">
          {page.blocks.map((block, i) => (
              <StoryPageBlock
                key={`${page.sceneId}-block-${i}`}
                block={block}
                index={i}
                isLatest={isLatest}
                sceneId={page.sceneId}
                onEdit={onEditNarration}
              />
            ))}
        </div>
      ) : (
        /* Fallback: old-style single image + narration */
        <>
          {page.imageUrl && (
            <div className="mb-6">
              <MediaDisplay
                imageUrl={page.imageUrl}
                alt={`Scene ${page.sceneNumber} illustration`}
              />
            </div>
          )}
          {page.narration && (
            <div className="rounded-xl border border-[#9fc8c5]/55 bg-[#f6fcfb]/86 p-4 backdrop-blur-sm sm:p-6">
              {isLatest ? (
                <TypewriterText
                  text={page.narration}
                  className="font-body text-base sm:text-lg text-dreamloom-text"
                />
              ) : (
                <p className="font-body text-base sm:text-lg leading-relaxed text-dreamloom-text">
                  {stripMarkdown(page.narration)}
                </p>
              )}
            </div>
          )}
        </>
      )}

      {/* Music mood badge */}
      {page.musicMood && (
        <motion.div
          className="mt-4 flex items-center gap-2"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: hasBlocks ? page.blocks.length * 0.2 + 0.3 : 0.8 }}
        >
          <MusicNoteIcon />
          <span className="font-body text-sm text-dreamloom-muted">
            {page.musicMood} atmosphere
          </span>
        </motion.div>
      )}

      {/* Action buttons */}
      {(onRegenerate || onDelete || onBranch) && (
        <div className="mt-3 flex items-center gap-2 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
          {onRegenerate && (
            <button
              onClick={() => onRegenerate(page.sceneNumber)}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-body text-sm text-dreamloom-muted transition-colors hover:text-dreamloom-gold hover:bg-dreamloom-gold/10"
            >
              <RefreshIcon />
              Regenerate
            </button>
          )}
          {onBranch && (
            <button
              onClick={() => onBranch(page.sceneId)}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-body text-sm text-dreamloom-muted transition-colors hover:text-violet-400 hover:bg-violet-400/10"
            >
              <BranchIcon />
              What If?
            </button>
          )}
          {onDelete && (
            <button
              onClick={() => onDelete(page.sceneNumber)}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-body text-sm text-dreamloom-muted transition-colors hover:text-red-400 hover:bg-red-400/10"
            >
              <TrashIcon />
              Delete
            </button>
          )}
        </div>
      )}

      {/* Emoji reactions */}
      <div className="mt-2 flex items-center gap-1.5">
        {REACTION_EMOJIS.map(({ key, emoji, label }) => (
          <motion.button
            key={key}
            onClick={() => toggleReaction(key)}
            whileTap={{ scale: 1.3 }}
            className="flex items-center gap-1 rounded-full border border-[#a8cfcc]/55 bg-[#edf7f5]/80 px-2.5 py-1 text-sm transition-colors hover:border-dreamloom-gold/45 hover:bg-dreamloom-gold/12"
            title={label}
          >
            <span>{emoji}</span>
            {(reactions[key] || 0) > 0 && (
              <span className="font-body text-xs text-dreamloom-gold">
                {reactions[key]}
              </span>
            )}
          </motion.button>
        ))}
      </div>
    </motion.div>
  );
});

function RefreshIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
      <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
      <path d="M16 16h5v5" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18" />
      <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
      <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
    </svg>
  );
}

function BranchIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="18" cy="18" r="3" />
      <circle cx="6" cy="6" r="3" />
      <circle cx="18" cy="6" r="3" />
      <path d="M6 9v6c0 1.657 1.343 3 3 3h3" />
      <path d="M18 9v6" />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
      <path d="m15 5 4 4" />
    </svg>
  );
}

function MusicNoteIcon() {
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
      <path d="M9 18V5l12-2v13" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="18" cy="16" r="3" />
    </svg>
  );
}

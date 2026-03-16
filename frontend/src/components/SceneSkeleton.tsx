/**
 * SceneSkeleton — shimmer loading placeholder mirroring StoryPage layout.
 */
export function SceneSkeleton() {
  return (
    <div className="mx-auto mb-8 sm:mb-12 max-w-2xl animate-pulse">
      {/* Scene header */}
      <div className="mb-4 flex items-center gap-3">
        <div className="shimmer h-6 w-24 rounded-full" />
        <div className="shimmer h-5 w-48 rounded-lg" />
      </div>

      {/* Text block */}
      <div className="mb-4 rounded-xl border border-white/5 bg-dreamloom-surface/30 p-4 sm:p-6">
        <div className="space-y-2.5">
          <div className="shimmer h-4 w-full rounded" />
          <div className="shimmer h-4 w-[90%] rounded" />
          <div className="shimmer h-4 w-[75%] rounded" />
        </div>
      </div>

      {/* Image placeholder */}
      <div className="shimmer aspect-video w-full rounded-xl" />

      {/* Second text block */}
      <div className="mt-4 rounded-xl border border-white/5 bg-dreamloom-surface/30 p-4 sm:p-6">
        <div className="space-y-2.5">
          <div className="shimmer h-4 w-full rounded" />
          <div className="shimmer h-4 w-[85%] rounded" />
        </div>
      </div>
    </div>
  );
}

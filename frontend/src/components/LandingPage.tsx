/**
 * LandingPage - premium campaign-style redesign for hackathon judging.
 *
 * Behavior preserved:
 * - start session
 * - template start
 * - gallery rendering
 * - resume/delete previous sessions
 * - mobile section navigation
 */
import { useRef, useState, type ReactNode } from "react";
import { motion, useMotionValueEvent, useScroll } from "framer-motion";
import type { SessionSummary } from "../hooks/useSessionHistory";
import { useGallery } from "../hooks/useGallery";
import { GallerySection } from "./GallerySection";

interface LandingPageProps {
  onStart: () => void;
  isConnecting: boolean;
  previousSessions?: SessionSummary[];
  sessionsLoading?: boolean;
  onResume?: (sessionId: string) => void;
  onDeleteSession?: (sessionId: string) => void;
  onStartWithTemplate?: (prompt: string) => void;
}

const LANDING_ASSETS = {
  texture: "/landing/texture-grain.png",
  heroMain: "/landing/hero-session-main.webp",
  heroLoop: "/landing/hero-loop.mp4",
  audienceFamilies: "/landing/audience-families.webp",
  audienceTeachers: "/landing/audience-teachers.webp",
  audienceCreators: "/landing/audience-creators.webp",
  momentDirectorsCut: "/landing/moment-directors-cut.webp",
} as const;

const BASE_NAV_LINKS = [
  { id: "proof", label: "Proof" },
  { id: "audience", label: "Audience" },
  { id: "moments", label: "Moments" },
  { id: "how", label: "How It Works" },
  { id: "cut", label: "Finale" },
];

const HERO_BADGES = [
  "Voice-first",
  "Interruption-ready",
  "Interleaved image + text",
  "Sketch-aware input",
  "Story continuity memory",
  "Director's Cut export",
];

const HERO_METRICS = [
  { label: "Latency Feel", value: "Live", detail: "Natural back-and-forth interaction" },
  { label: "Creative Modes", value: "3", detail: "Voice, camera, and guided starts" },
  { label: "Scene Output", value: "Multimodal", detail: "Narration + visuals in one flow" },
];

const PROOF_POINTS = [
  {
    title: "Real-Time Creative Direction",
    body: "People can speak naturally, interrupt mid-response, and steer plot, mood, and pacing without restarting.",
    accent: "from-[#29a9b5]/20 to-transparent border-[#29a9b5]/35",
  },
  {
    title: "Interleaved Story Generation",
    body: "Scenes are generated as mixed text and images in the same response stream, not separate disconnected steps.",
    accent: "from-[#e1854d]/20 to-transparent border-[#e1854d]/35",
  },
  {
    title: "Continuity That Holds",
    body: "Characters, objects, and callbacks are tracked so stories remain coherent from opening scene to finale.",
    accent: "from-[#2b7e78]/20 to-transparent border-[#2b7e78]/35",
  },
];

const AUDIENCE_CARDS = [
  {
    title: "Families",
    body: "Turn bedtime into a collaborative storytelling ritual where kids can guide the plot out loud.",
    accent: "from-[#f7b27a]/40 via-[#f7b27a]/12 to-transparent border-[#e09a62]/55",
    image: LANDING_ASSETS.audienceFamilies,
  },
  {
    title: "Teachers",
    body: "Transform lesson prompts into vivid scenes students can react to and discuss in real time.",
    accent: "from-[#7cd4cd]/38 via-[#7cd4cd]/12 to-transparent border-[#4fbeb4]/55",
    image: LANDING_ASSETS.audienceTeachers,
  },
  {
    title: "Non-Writers",
    body: "Create rich narrative experiences through conversation instead of prompt engineering syntax.",
    accent: "from-[#8faad2]/35 via-[#8faad2]/10 to-transparent border-[#6e8cbc]/55",
    image: LANDING_ASSETS.audienceCreators,
  },
];

const SIGNATURE_MOMENTS = [
  {
    title: "Interrupt Mid-Scene",
    body: "Change direction while Loom is speaking and get an immediate coherent pivot.",
  },
  {
    title: "Sketch to Story",
    body: "Show a rough drawing to the camera and fold it into the next visual beat.",
  },
  {
    title: "Continuity Callback",
    body: "Ask about details from earlier scenes and get grounded answers from memory.",
  },
  {
    title: "Director's Cut",
    body: "Finish with polished cover art, trailer text, and recap-ready story packaging.",
  },
];

const TEMPLATE_CARDS = [
  {
    audience: "Family Night",
    title: "Bedtime Adventure",
    description: "Warm visual tone with a gentle emotional arc and reassuring ending.",
    prompt:
      "Let's create a bedtime story about a tiny fox that is scared of the dark until friendly starlight guides them home.",
    accent: "from-[#e89c62]/35 via-[#e89c62]/12 to-transparent border-[#d98749]/45",
  },
  {
    audience: "Classroom",
    title: "Learning Quest",
    description: "Spoken lesson prompts become vivid scenes students can explore together.",
    prompt:
      "Create a classroom story where a curious inventor learns the water cycle by traveling through clouds, rain, rivers, and oceans.",
    accent: "from-[#63c9be]/35 via-[#63c9be]/12 to-transparent border-[#3fb5a8]/45",
  },
  {
    audience: "Creators",
    title: "Sketch Catalyst",
    description: "Build a narrative around rough concepts and visual references.",
    prompt:
      "I have a sketch of an owl librarian. Build a story where this owl protects a floating archive in the sky.",
    accent: "from-[#98a9df]/35 via-[#98a9df]/12 to-transparent border-[#728bcf]/45",
  },
];

const HOW_STEPS = [
  {
    title: "Speak",
    body: "Describe your world, hero, or first scene idea in your own words.",
  },
  {
    title: "Steer",
    body: "Interrupt, refine direction, and use camera context when inspiration hits.",
  },
  {
    title: "Finish",
    body: "Wrap the journey into a polished Director's Cut you can present and share.",
  },
];

const UNDER_HOOD = [
  "Gemini Live API for low-latency conversational direction",
  "Interleaved text + image generation for scene coherence",
  "Story Bible state for memory, callbacks, and continuity",
  "Mood-matched music generation per scene progression",
  "Cloud-hosted backend with persisted session history",
];

function timeAgo(ts: number): string {
  const seconds = Math.floor(Date.now() / 1000 - ts);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function Section({
  id,
  label,
  title,
  subtitle,
  children,
}: {
  id: string;
  label: string;
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="px-6 py-20 sm:px-10 sm:py-24">
      <div className="mx-auto max-w-6xl">
        <div className="mb-10 sm:mb-12">
          <p className="font-body text-[11px] font-semibold uppercase tracking-[0.28em] text-[#20656d]">
            {label}
          </p>
          <h2 className="mt-2 font-display text-4xl font-semibold leading-tight tracking-[-0.015em] text-[#102733] sm:text-5xl">
            {title}
          </h2>
          {subtitle && (
            <p className="mt-4 max-w-3xl font-body text-base font-medium leading-[1.72] text-[#395562]">
              {subtitle}
            </p>
          )}
        </div>
        {children}
      </div>
    </section>
  );
}

function HeroPreview() {
  return (
    <motion.div
      className="relative overflow-hidden rounded-[34px] border border-[#5ca7b0]/35 bg-[#102b3f]/90 p-5 shadow-[0_30px_90px_rgba(6,30,49,0.35)] backdrop-blur-xl sm:p-6"
      initial={{ opacity: 0, y: 18, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_8%_0%,rgba(124,224,222,0.28),transparent_35%),radial-gradient(circle_at_100%_18%,rgba(255,154,93,0.22),transparent_38%)]" />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.08] mix-blend-screen"
        style={{
          backgroundImage: `url(${LANDING_ASSETS.texture})`,
          backgroundSize: "220px 220px",
        }}
      />

      <div className="relative">
        <div className="mb-4 flex items-center justify-between rounded-xl border border-[#6cb0b8]/35 bg-[#0b2335]/85 px-3 py-2">
          <div className="flex gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-[#fd9c5f]/85" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#78dfd4]/85" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#8aa0e9]/85" />
          </div>
          <span className="font-body text-[10px] uppercase tracking-[0.22em] text-[#b4dce0]">
            Live Session Preview
          </span>
        </div>

        <div className="relative overflow-hidden rounded-2xl border border-[#63afb8]/45">
          <video
            src={LANDING_ASSETS.heroLoop}
            autoPlay
            muted
            loop
            playsInline
            className="h-56 w-full object-cover sm:h-[320px]"
          />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#092235]/88 via-[#0e2e44]/35 to-transparent" />
          <div className="absolute left-3 top-3 flex gap-2">
            <span className="rounded-full border border-[#7cc8cf]/45 bg-[#0d3349]/70 px-2.5 py-1 font-body text-[10px] uppercase tracking-[0.2em] text-[#c2e8ea]">
              Voice-First
            </span>
            <span className="rounded-full border border-[#e5af87]/45 bg-[#3b2a1f]/65 px-2.5 py-1 font-body text-[10px] uppercase tracking-[0.2em] text-[#ffd9be]">
              Interleaved Output
            </span>
          </div>
          <div className="absolute bottom-4 left-4 right-4">
            <p className="font-display text-2xl font-semibold tracking-[-0.015em] text-[#eef9fb]">
              Speak. Interrupt. Watch it pivot.
            </p>
            <p className="mt-1 font-body text-sm font-medium text-[#c8e8ec]">
              Live narration and visuals generated together with story continuity.
            </p>
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-[#5da8b0]/35 bg-[#0d2739]/85 p-4">
            <p className="font-body text-[10px] uppercase tracking-[0.2em] text-[#9fcfd4]">
              Why this works
            </p>
            <div className="mt-2 space-y-1.5 font-body text-sm text-[#d6ecf1]">
              <p>Natural voice control with interruption.</p>
              <p>Text and visuals stream in one flow.</p>
              <p>Continuity tracked across scenes.</p>
            </div>
          </div>
          <div className="rounded-xl border border-[#5da8b0]/35 bg-[#0d2739]/85 p-4">
            <p className="font-body text-[10px] uppercase tracking-[0.2em] text-[#9fcfd4]">
              Voice Activity
            </p>
            <div className="mt-3 flex items-end gap-1.5">
              {[8, 16, 12, 22, 14, 18, 10, 20].map((h, i) => (
                <motion.span
                  key={`${h}-${i}`}
                  className="w-1.5 rounded-full bg-gradient-to-t from-[#4fd0c3] to-[#ffc9a2]"
                  animate={{ height: [6, h, 8] }}
                  transition={{ duration: 1.1, delay: i * 0.08, repeat: Infinity }}
                />
              ))}
            </div>
            <p className="mt-3 font-display text-2xl font-semibold tracking-[-0.01em] text-[#bdf4ee]">
              Live
            </p>
            <p className="font-body text-sm text-[#c8e8ec]">
              Listening, thinking, and generating in one loop.
            </p>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function SessionCard({
  session,
  onResume,
  onDelete,
}: {
  session: SessionSummary;
  onResume?: (sessionId: string) => void;
  onDelete?: (sessionId: string) => void;
}) {
  return (
    <motion.button
      onClick={() => onResume?.(session.session_id)}
      className="group relative flex w-full items-start gap-4 rounded-2xl border border-[#9ec9c8]/45 bg-[#f5fbfa]/90 p-4 text-left transition-colors hover:border-[#2d9da7] hover:bg-[#edf8f6]"
      whileHover={{ scale: 1.01 }}
      whileTap={{ scale: 0.995 }}
    >
      {session.thumbnail ? (
        <img
          src={session.thumbnail}
          alt=""
          className="h-16 w-16 flex-shrink-0 rounded-xl object-cover"
        />
      ) : (
        <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-xl border border-[#9ec9c8]/55 bg-[#ddf2ef]">
          <BookIcon className="text-[#237983]/80" />
        </div>
      )}

      <div className="min-w-0 flex-1">
        <p className="truncate font-display text-2xl font-semibold tracking-[-0.01em] text-[#132d39]">
          {session.title || "Untitled Story"}
        </p>
        <p className="mt-1 font-body text-xs font-medium text-[#456371]">
          {session.genre ? `${session.genre} - ` : ""}
          {session.scene_count} scene{session.scene_count !== 1 ? "s" : ""} -{" "}
          {timeAgo(session.updated_at)}
        </p>
      </div>

      <ChevronIcon className="mt-2 text-[#267f8a]/0 transition-colors group-hover:text-[#267f8a]/90" />

      {onDelete && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete(session.session_id);
          }}
          className="absolute right-2 top-2 rounded-md p-1 text-[#456371]/0 transition-colors group-hover:text-[#456371]/65 hover:!text-red-500"
          aria-label="Delete session"
        >
          <CloseIcon />
        </button>
      )}
    </motion.button>
  );
}

export function LandingPage({
  onStart,
  isConnecting,
  previousSessions = [],
  sessionsLoading = false,
  onResume,
  onDeleteSession,
  onStartWithTemplate,
}: LandingPageProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const { scrollY } = useScroll({ container: scrollRef });
  const [navSolid, setNavSolid] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const gallery = useGallery();
  const hasGallery = gallery.stories.length > 0;
  const navLinks = hasGallery
    ? [BASE_NAV_LINKS[0], { id: "gallery", label: "Gallery" }, ...BASE_NAV_LINKS.slice(1)]
    : BASE_NAV_LINKS;

  useMotionValueEvent(scrollY, "change", (value) => {
    setNavSolid(value > 18);
  });

  const scrollTo = (id: string) => {
    const el = scrollRef.current?.querySelector(`#${id}`);
    el?.scrollIntoView({ behavior: "smooth" });
    setMobileMenuOpen(false);
  };

  return (
    <div ref={scrollRef} className="relative h-full overflow-y-auto bg-[#edf4f3] text-[#102430] selection:bg-[#1f8e98]/20 [font-kerning:normal]">
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(120%_90%_at_10%_-15%,rgba(63,176,177,0.24),transparent_42%),radial-gradient(95%_70%_at_95%_0%,rgba(235,141,80,0.2),transparent_40%),linear-gradient(180deg,#edf4f3_0%,#f8f1e6_55%,#edf4f3_100%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(14,53,67,0.045)_1px,transparent_1px),linear-gradient(to_bottom,rgba(14,53,67,0.045)_1px,transparent_1px)] [background-size:44px_44px]" />
        <div
          className="absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage: `url(${LANDING_ASSETS.texture})`,
            backgroundSize: "260px 260px",
          }}
        />
        <motion.div
          className="absolute -left-12 top-20 h-72 w-72 rounded-full bg-[#3bc1bf]/20 blur-3xl"
          animate={{ x: [0, 20, 0], y: [0, -10, 0], opacity: [0.3, 0.6, 0.3] }}
          transition={{ duration: 16, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute -right-16 top-24 h-80 w-80 rounded-full bg-[#ec8a4f]/22 blur-3xl"
          animate={{ x: [0, -16, 0], y: [0, 12, 0], opacity: [0.25, 0.48, 0.25] }}
          transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
        />
      </div>

      <div className="relative z-20">
        <div className="border-b border-[#2a7b85]/25 bg-[#0f3a4a]/94 px-4 py-2 text-center backdrop-blur-md">
          <p className="font-body text-[11px] font-medium uppercase tracking-[0.2em] text-[#d2f2ee]">
            Built for Gemini Live Agent Challenge | Voice-native creative storytelling
          </p>
        </div>

        <motion.nav
          className="sticky top-0 z-40 flex items-center justify-between gap-4 border-b px-4 py-3 backdrop-blur-lg sm:px-8"
          style={{
            borderColor: navSolid ? "rgba(26,113,120,0.32)" : "transparent",
            backgroundColor: navSolid ? "rgba(237,244,243,0.95)" : "rgba(237,244,243,0.74)",
          }}
        >
          <button
            onClick={() => scrollTo("hero")}
            className="flex items-end gap-2 text-left"
            aria-label="DreamLoom home"
          >
            <span className="font-display text-2xl font-semibold tracking-[-0.01em] text-[#153544]">Dream</span>
            <span className="bg-gradient-to-r from-[#1795a2] via-[#28b5b4] to-[#e4864a] bg-clip-text font-display text-2xl font-semibold tracking-[-0.01em] text-transparent">
              Loom
            </span>
            <span className="hidden pb-0.5 font-body text-xs font-medium uppercase tracking-[0.16em] text-[#516f7a] md:inline">
              Story Studio
            </span>
          </button>

          <div className="hidden items-center gap-4 lg:flex">
            {navLinks.map((link) => (
              <button
                key={link.id}
                onClick={() => scrollTo(link.id)}
                className="font-body text-sm font-medium tracking-[0.01em] text-[#395a67] transition-colors hover:text-[#147f8d]"
              >
                {link.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onStart}
              disabled={isConnecting}
              className="rounded-full bg-gradient-to-r from-[#168792] via-[#1c9ba2] to-[#db7c43] px-4 py-1.5 font-body text-sm font-semibold text-[#f7fffd] shadow-[0_0_24px_rgba(27,156,162,0.28)] transition-colors hover:from-[#147b85] hover:via-[#178f95] hover:to-[#c76d39] disabled:cursor-not-allowed disabled:opacity-60 sm:px-5 sm:py-2"
            >
              {isConnecting ? "Connecting..." : "Begin Your Story"}
            </button>
            <button
              onClick={() => setMobileMenuOpen((open) => !open)}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#a6ccc8] text-[#35616d] transition-colors hover:border-[#1f8f9a] hover:text-[#1f8f9a] lg:hidden"
              aria-label="Toggle menu"
            >
              <MenuIcon open={mobileMenuOpen} />
            </button>
          </div>
        </motion.nav>

        {mobileMenuOpen && (
          <div className="sticky top-12 z-30 border-b border-[#9fc7c2] bg-[#edf4f3]/95 px-4 py-3 backdrop-blur-lg lg:hidden">
            <div className="flex flex-col gap-2">
              {navLinks.map((link) => (
                <button
                  key={link.id}
                  onClick={() => scrollTo(link.id)}
                  className="rounded-lg px-3 py-2 text-left font-body text-sm text-[#385865] transition-colors hover:bg-[#dff1ee] hover:text-[#107b88]"
                >
                  {link.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <section id="hero" className="px-6 pb-14 pt-14 sm:px-10 sm:pb-16 sm:pt-20">
          <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[1fr_1fr] lg:items-center">
            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
            >
              <p className="mb-4 font-body text-xs font-semibold uppercase tracking-[0.22em] text-[#2c7480]">
                Voice-first co-creation for families, teachers, and non-writers
              </p>
              <h1 className="font-display text-5xl font-semibold leading-[0.95] tracking-[-0.02em] text-[#0f2733] sm:text-7xl">
                Talk to your story.
                <span className="mt-2 block bg-gradient-to-r from-[#128694] via-[#27aeb0] to-[#d57a41] bg-clip-text text-transparent">
                  Watch scenes answer back.
                </span>
              </h1>
              <p className="mt-6 max-w-xl font-body text-base font-medium leading-[1.72] text-[#3d5b67] sm:text-lg">
                DreamLoom is an AI creative director, not a prompt form. You can speak,
                interrupt, and steer every beat while narration, illustrations, and
                soundtrack are woven together in one live storytelling flow.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <button
                  onClick={onStart}
                  disabled={isConnecting}
                  className="rounded-full bg-gradient-to-r from-[#168792] via-[#1d9ca3] to-[#dc7d44] px-6 py-2.5 font-body text-base font-semibold tracking-[0.01em] text-[#f7fffd] shadow-[0_0_35px_rgba(32,160,164,0.28)] transition-transform hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-60 sm:px-7 sm:py-3"
                >
                  {isConnecting ? "Connecting..." : "Begin Your Story"}
                </button>
                <button
                  onClick={() => scrollTo("moments")}
                  className="rounded-full border border-[#96c3bf] bg-[#f3fbfa]/70 px-6 py-2.5 font-body text-sm font-medium text-[#264654] transition-colors hover:border-[#1e8d99] hover:text-[#1e8d99] sm:px-7 sm:py-3"
                >
                  Explore Signature Moments
                </button>
              </div>
              <div className="mt-8 flex flex-wrap gap-2">
                {HERO_BADGES.map((badge) => (
                  <span
                    key={badge}
                    className="rounded-full border border-[#a8cfcb] bg-[#f6fcfb]/80 px-3 py-1 font-body text-xs font-medium text-[#365663]"
                  >
                    {badge}
                  </span>
                ))}
              </div>

              <div className="mt-7 grid gap-3 sm:grid-cols-3">
                {HERO_METRICS.map((metric) => (
                  <div
                    key={metric.label}
                    className="rounded-2xl border border-[#a7ceca]/45 bg-[#f3fbfa]/80 p-3"
                  >
                    <p className="font-body text-[10px] uppercase tracking-[0.2em] text-[#4d6d79]">
                      {metric.label}
                    </p>
                    <p className="mt-1 font-display text-3xl font-semibold tracking-[-0.01em] text-[#123240]">{metric.value}</p>
                    <p className="mt-0.5 font-body text-xs text-[#4a6875]">{metric.detail}</p>
                  </div>
                ))}
              </div>
            </motion.div>
            <HeroPreview />
          </div>
        </section>

        <Section
          id="proof"
          label="Judging Lens"
          title="Built to prove live multimodal storytelling, not static prompt output."
          subtitle="This narrative is evidence-first: direction in conversation, interleaved output, and continuity that can be demonstrated in minutes."
        >
          <div className="grid gap-4 md:grid-cols-3">
            {PROOF_POINTS.map((point, index) => (
              <motion.div
                key={point.title}
                className={`rounded-2xl border bg-gradient-to-br p-5 ${point.accent}`}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.25 }}
                transition={{ duration: 0.42, delay: index * 0.08 }}
              >
                <h3 className="font-display text-3xl font-semibold tracking-[-0.015em] text-[#123240]">{point.title}</h3>
                <p className="mt-3 font-body text-sm font-medium leading-[1.7] text-[#3e5b67]">
                  {point.body}
                </p>
              </motion.div>
            ))}
          </div>

          <div className="mt-6 rounded-2xl border border-[#99c6c4]/45 bg-[#f3fbfa]/80 p-5">
            <p className="font-body text-[11px] uppercase tracking-[0.24em] text-[#2c7580]">
              Judge Demo Flow
            </p>
            <div className="mt-3 grid gap-3 font-body text-sm text-[#33515d] sm:grid-cols-3">
              <p className="rounded-xl border border-[#a9d0cc]/45 bg-[#f8fdfd]/80 p-3">
                1. Start voice session and define hero + world.
              </p>
              <p className="rounded-xl border border-[#a9d0cc]/45 bg-[#f8fdfd]/80 p-3">
                2. Interrupt scene and pivot tone in real time.
              </p>
              <p className="rounded-xl border border-[#a9d0cc]/45 bg-[#f8fdfd]/80 p-3">
                3. End with Director's Cut summary and visuals.
              </p>
            </div>
          </div>
        </Section>

        <Section
          id="audience"
          label="Who It's For"
          title="DreamLoom gives story ownership to people who think in voice, not prompts."
        >
          <div className="grid gap-4 md:grid-cols-3">
            {AUDIENCE_CARDS.map((card, index) => (
              <motion.div
                key={card.title}
                className={`rounded-2xl border bg-gradient-to-br p-5 ${card.accent}`}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.25 }}
                transition={{ duration: 0.42, delay: index * 0.08 }}
              >
                <img
                  src={card.image}
                  alt={`${card.title} using DreamLoom`}
                  className="mb-4 aspect-[4/3] w-full rounded-xl border border-white/30 object-cover"
                  loading="lazy"
                />
                <h3 className="font-display text-3xl font-semibold tracking-[-0.015em] text-[#123240]">{card.title}</h3>
                <p className="mt-3 font-body text-sm font-medium leading-[1.7] text-[#3f5e6a]">
                  {card.body}
                </p>
              </motion.div>
            ))}
          </div>
        </Section>

        {onStartWithTemplate && (
          <Section
            id="templates"
            label="Guided Starts"
            title="Pick a launch path and jump straight into a high-quality first scene."
          >
            <div className="grid gap-4 md:grid-cols-3">
              {TEMPLATE_CARDS.map((template, index) => (
                <motion.button
                  key={template.title}
                  onClick={() => onStartWithTemplate(template.prompt)}
                  disabled={isConnecting}
                  className={`rounded-2xl border bg-gradient-to-br p-5 text-left transition-transform hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60 ${template.accent}`}
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.25 }}
                  transition={{ duration: 0.42, delay: index * 0.08 }}
                >
                  <p className="font-body text-[11px] uppercase tracking-[0.2em] text-[#4d6a76]">
                    {template.audience}
                  </p>
                  <h3 className="mt-2 font-display text-3xl font-semibold tracking-[-0.015em] text-[#123240]">{template.title}</h3>
                  <p className="mt-3 font-body text-sm font-medium leading-[1.68] text-[#3d5a67]">
                    {template.description}
                  </p>
                  <span className="mt-5 inline-flex items-center gap-1 font-body text-xs font-medium text-[#127f8d]">
                    Start this flow <ChevronIcon className="h-4 w-4" />
                  </span>
                </motion.button>
              ))}
            </div>
          </Section>
        )}

        {hasGallery && (
          <div className="relative border-y border-[#305269]/45 bg-gradient-to-b from-[#0d1826] via-[#10233a] to-[#122945]">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_90%_at_20%_0%,rgba(72,202,199,0.16),transparent_45%),radial-gradient(90%_80%_at_95%_15%,rgba(227,137,77,0.14),transparent_42%)]" />
            <div className="relative">
              <GallerySection stories={gallery.stories} fetchStory={gallery.fetchStory} />
            </div>
          </div>
        )}

        <Section
          id="moments"
          label="Signature Moments"
          title="The interactions people remember after using DreamLoom."
        >
          <motion.div
            className="mb-6 overflow-hidden rounded-3xl border border-[#9fc8c6]/55 bg-[#f6fcfb]/90 p-3 shadow-[0_18px_50px_rgba(19,83,96,0.12)]"
            initial={{ opacity: 0, y: 14 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ duration: 0.45 }}
          >
            <img
              src={LANDING_ASSETS.heroMain}
              alt="Sketch to Story in action"
              className="aspect-[16/9] w-full rounded-2xl object-cover"
              loading="lazy"
            />
          </motion.div>

          <div className="grid gap-4 md:grid-cols-2">
            {SIGNATURE_MOMENTS.map((item, index) => (
              <motion.div
                key={item.title}
                className="rounded-2xl border border-[#9fc8c6]/45 bg-[#f5fbfa]/85 p-5"
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.25 }}
                transition={{ duration: 0.42, delay: index * 0.07 }}
              >
                <h3 className="font-display text-3xl font-semibold tracking-[-0.015em] text-[#123240]">{item.title}</h3>
                <p className="mt-3 font-body text-sm font-medium leading-[1.7] text-[#3f5f6b]">
                  {item.body}
                </p>
              </motion.div>
            ))}
          </div>
        </Section>

        <Section id="how" label="How It Works" title="A simple loop: speak, steer, finish.">
          <div className="grid gap-4 md:grid-cols-3">
            {HOW_STEPS.map((step, index) => (
              <motion.div
                key={step.title}
                className="rounded-2xl border border-[#9fc8c6]/45 bg-[#f5fbfa]/85 p-5"
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.25 }}
                transition={{ duration: 0.42, delay: index * 0.08 }}
              >
                <div className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-r from-[#158490] to-[#d97d46] font-body text-xs font-bold text-[#f9fffe]">
                  {index + 1}
                </div>
                <h3 className="font-display text-3xl font-semibold tracking-[-0.015em] text-[#123240]">{step.title}</h3>
                <p className="mt-3 font-body text-sm font-medium leading-[1.68] text-[#3d5c68]">{step.body}</p>
              </motion.div>
            ))}
          </div>
        </Section>

        <Section
          id="underhood"
          label="Technical Credibility"
          title="Engineered for reliable real-time storytelling on Google infrastructure."
        >
          <div className="rounded-2xl border border-[#9cc7c4]/45 bg-[#f5fbfa]/85 p-6">
            <ul className="grid gap-3 md:grid-cols-2">
              {UNDER_HOOD.map((item) => (
                <li key={item} className="flex items-start gap-3 font-body text-sm text-[#355461]">
                  <span className="mt-1 h-2 w-2 flex-shrink-0 rounded-full bg-[#148692]" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </Section>

        <Section
          id="library"
          label="Your Stories"
          title="Resume your recent sessions without losing momentum."
        >
          {previousSessions.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2">
              {previousSessions.map((session) => (
                <SessionCard
                  key={session.session_id}
                  session={session}
                  onResume={onResume}
                  onDelete={onDeleteSession}
                />
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-[#98c5c0]/60 bg-[#f5fbfa]/85 p-8 text-center">
              <p className="font-display text-3xl font-semibold tracking-[-0.015em] text-[#1a3b49]">
                No stories yet. Start your first one now.
              </p>
              {sessionsLoading && (
                <p className="mt-2 font-body text-xs text-[#58737f]">Loading...</p>
              )}
            </div>
          )}
          {sessionsLoading && previousSessions.length > 0 && (
            <p className="mt-4 font-body text-xs text-[#58737f]">Refreshing sessions...</p>
          )}
        </Section>

        <Section
          id="cut"
          label="Director's Cut"
          title="Start with a voice idea. End with a world worth sharing."
        >
          <div className="relative overflow-hidden rounded-[32px] border border-[#4b8d98]/55 bg-gradient-to-br from-[#0f3248] via-[#16445c] to-[#1d5068] p-8 text-center">
            <img
              src={LANDING_ASSETS.momentDirectorsCut}
              alt="DreamLoom Director's Cut finale"
              className="absolute inset-0 h-full w-full object-cover opacity-30"
              loading="lazy"
            />
            <div className="absolute inset-0 bg-gradient-to-br from-[#0f3248]/88 via-[#16445c]/82 to-[#1d5068]/88" />
            <div className="relative z-10">
              <p className="mx-auto max-w-2xl font-body text-base font-medium leading-[1.72] text-[#d6edf2]">
                DreamLoom keeps creative ownership in the user's hands while the system
                handles visuals, pacing, and continuity. When the story ends, Director's
                Cut turns the journey into a polished finale with cover art and cinematic recap.
              </p>
              <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
                <button
                  onClick={onStart}
                  disabled={isConnecting}
                  className="rounded-full bg-gradient-to-r from-[#17919d] to-[#e1864a] px-7 py-3 font-body text-base font-semibold tracking-[0.01em] text-[#f8fffd] transition-colors hover:from-[#157d87] hover:to-[#ca7440] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isConnecting ? "Connecting..." : "Begin Your Story"}
                </button>
                <button
                  onClick={() => scrollTo("proof")}
                  className="rounded-full border border-[#78b3ba]/70 px-7 py-3 font-body text-sm text-[#d6edf2] transition-colors hover:border-[#9dd6da] hover:text-[#f4fbfc]"
                >
                  Review Core Proof
                </button>
              </div>
            </div>
          </div>
        </Section>

        <footer className="border-t border-[#97c3c0]/45 px-6 py-8 text-center sm:px-10">
          <p className="font-body text-xs font-medium uppercase tracking-[0.18em] text-[#4c6875]">
            DreamLoom | Voice-first storytelling studio powered by Gemini and Google Cloud
          </p>
        </footer>
      </div>
    </div>
  );
}

function BookIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20" />
    </svg>
  );
}

function ChevronIcon({ className = "" }: { className?: string }) {
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
      className={className}
    >
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function MenuIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {open ? (
        <>
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </>
      ) : (
        <>
          <line x1="4" y1="6" x2="20" y2="6" />
          <line x1="4" y1="12" x2="20" y2="12" />
          <line x1="4" y1="18" x2="20" y2="18" />
        </>
      )}
    </svg>
  );
}

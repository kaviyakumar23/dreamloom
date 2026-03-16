/**
 * LandingPage - focused showcase for the Gemini Live Agent Challenge.
 *
 * Goal: help judges understand "who this is for" and "why this is special"
 * in the first few seconds, then provide a clear path into the app.
 */
import { useRef, useState } from "react";
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

const BASE_NAV_LINKS = [
  { id: "why", label: "Why It Works" },
  { id: "moments", label: "Signature Moments" },
  { id: "how", label: "How It Works" },
  { id: "cut", label: "Director's Cut" },
];

const PROOF_CHIPS = [
  "Live voice conversation",
  "Interleaved text + image scenes",
  "Sketch-to-story with camera",
  "Mood-matched music",
  "Story memory that sticks",
];

const TEMPLATES = [
  {
    title: "Bedtime Story",
    audience: "Families",
    description: "Create a calming story arc in minutes with voice-only direction.",
    prompt:
      "Let's create a gentle bedtime story about a little fox who is afraid of the dark forest but discovers that the stars are guiding friends.",
    toneClass:
      "from-dreamloom-gold/20 via-dreamloom-gold/5 to-transparent border-dreamloom-gold/20",
  },
  {
    title: "Classroom Prompt",
    audience: "Teachers",
    description: "Turn a spoken lesson prompt into scenes students can discuss.",
    prompt:
      "Create an educational adventure for a classroom: a young inventor learns about the water cycle while traveling through clouds, rain, rivers, and oceans.",
    toneClass:
      "from-emerald-400/20 via-emerald-400/5 to-transparent border-emerald-300/20",
  },
  {
    title: "Sketch-to-Story",
    audience: "Creators",
    description: "Show a sketch and let DreamLoom fold it into the next scene.",
    prompt:
      "I want to build a visual story around my sketch. The main character is an owl librarian who guards a floating archive in the sky.",
    toneClass:
      "from-sky-400/20 via-sky-400/5 to-transparent border-sky-300/20",
  },
];

const BENEFITS = [
  {
    title: "For Families",
    body: "Create bedtime stories together out loud without typing prompts.",
  },
  {
    title: "For Classrooms",
    body: "Turn spoken ideas into illustrated scenes that spark discussion.",
  },
  {
    title: "For Non-Writers",
    body: "Build rich narratives through conversation, not prompt engineering.",
  },
];

const SIGNATURE_MOMENTS = [
  {
    title: "Interrupt Mid-Story",
    body: "Change mood or direction in real time and Loom pivots immediately.",
  },
  {
    title: "Show A Sketch",
    body: "Hold up a drawing and watch the concept appear in the next scene.",
  },
  {
    title: "Ask For Continuity",
    body: "Loom recalls names, objects, and plot beats from the Story Bible.",
  },
  {
    title: "Create The Director's Cut",
    body: "End with cover art, logline, trailer text, and animatic-ready scenes.",
  },
];

const HOW_STEPS = [
  {
    title: "Speak",
    body: "Describe a world, character, or spark of an idea.",
  },
  {
    title: "Steer",
    body: "Interrupt, answer prompts, and show sketches when inspiration hits.",
  },
  {
    title: "Watch",
    body: "Narration, illustrations, and music arrive as one live flow.",
  },
];

const UNDER_HOOD = [
  "Gemini Live API for real-time voice interaction",
  "Native interleaved text + image scene generation",
  "Story Bible continuity across scenes and callbacks",
  "Mood-matched music generation for atmosphere",
  "Google Cloud Run deployment path for production",
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
  title,
  eyebrow,
  children,
}: {
  id: string;
  title: string;
  eyebrow: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="px-6 py-20 sm:px-10 sm:py-24">
      <div className="mx-auto max-w-6xl">
        <div className="mb-10 flex items-end justify-between gap-4">
          <div>
            <p className="mb-2 font-body text-[11px] uppercase tracking-[0.28em] text-dreamloom-gold/70">
              {eyebrow}
            </p>
            <h2 className="font-display text-3xl text-white sm:text-4xl">{title}</h2>
          </div>
          <div className="hidden h-px flex-1 bg-gradient-to-r from-dreamloom-gold/25 to-transparent md:block" />
        </div>
        {children}
      </div>
    </section>
  );
}

function ProductPreviewCard() {
  return (
    <motion.div
      className="relative overflow-hidden rounded-3xl border border-white/10 bg-dreamloom-surface/85 p-5 shadow-[0_25px_90px_rgba(0,0,0,0.45)] backdrop-blur-xl sm:p-7"
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: 0.55 }}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_5%,rgba(245,158,11,0.15),transparent_35%)]" />
      <div className="relative grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-4">
          <div className="overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-[#2a2043] via-[#1b2f4f] to-[#113024] p-4 sm:p-5">
            <p className="font-body text-xs uppercase tracking-[0.25em] text-dreamloom-gold/80">
              Live Scene
            </p>
            <div className="mt-3 rounded-xl border border-white/10 bg-black/20 p-4">
              <div className="mb-3 h-36 rounded-lg bg-gradient-to-br from-white/20 via-white/5 to-transparent sm:h-44" />
              <p className="font-body text-sm leading-relaxed text-dreamloom-text/90">
                Mira stepped through the inked border of her map, and moonlit mushrooms
                turned the forest path into a ribbon of blue light.
              </p>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-white/10 bg-dreamloom-card/70 p-3">
              <p className="font-body text-[11px] uppercase tracking-[0.2em] text-dreamloom-muted">
                Mic State
              </p>
              <p className="mt-1 font-display text-lg text-dreamloom-gold">
                Listening Live
              </p>
            </div>
            <div className="rounded-xl border border-white/10 bg-dreamloom-card/70 p-3">
              <p className="font-body text-[11px] uppercase tracking-[0.2em] text-dreamloom-muted">
                Camera Input
              </p>
              <p className="mt-1 font-display text-lg text-emerald-300">Sketch Detected</p>
            </div>
          </div>
        </div>
        <div className="space-y-4">
          <div className="rounded-2xl border border-white/10 bg-dreamloom-card/70 p-4">
            <p className="font-body text-[11px] uppercase tracking-[0.2em] text-dreamloom-gold/75">
              Under The Hood
            </p>
            <ul className="mt-3 space-y-2 font-mono text-xs text-dreamloom-text/90">
              <li>model: gemini-2.5-flash-image</li>
              <li>response_modalities: ["TEXT","IMAGE"]</li>
              <li>part_order: 0:text, 1:image, 2:text</li>
              <li>generation_ms: 10240</li>
            </ul>
          </div>
          <div className="rounded-2xl border border-white/10 bg-dreamloom-card/70 p-4">
            <p className="font-body text-[11px] uppercase tracking-[0.2em] text-dreamloom-gold/75">
              Story Bible
            </p>
            <div className="mt-3 space-y-2 font-body text-sm text-dreamloom-text/80">
              <p>Character: Mira (mapmaker)</p>
              <p>Object: Copper compass</p>
              <p>Mood: Wonder to Mystery</p>
            </div>
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
      className="group relative flex w-full items-start gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-left transition-colors hover:border-dreamloom-gold/25 hover:bg-white/[0.05]"
      whileHover={{ scale: 1.01 }}
      whileTap={{ scale: 0.99 }}
    >
      {session.thumbnail ? (
        <img
          src={session.thumbnail}
          alt=""
          className="h-16 w-16 flex-shrink-0 rounded-xl object-cover"
        />
      ) : (
        <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-xl border border-white/10 bg-dreamloom-card/70">
          <BookIcon className="text-dreamloom-gold/45" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate font-display text-lg text-white">
          {session.title || "Untitled Story"}
        </p>
        <p className="mt-1 font-body text-xs text-dreamloom-muted/90">
          {session.genre ? `${session.genre} - ` : ""}
          {session.scene_count} scene{session.scene_count !== 1 ? "s" : ""} -{" "}
          {timeAgo(session.updated_at)}
        </p>
      </div>
      <ChevronIcon className="mt-2 text-dreamloom-gold/0 transition-colors group-hover:text-dreamloom-gold/70" />
      {onDelete && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete(session.session_id);
          }}
          className="absolute right-2 top-2 rounded-md p-1 text-white/0 transition-colors group-hover:text-white/30 hover:!text-red-400"
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
    setNavSolid(value > 28);
  });

  const scrollTo = (id: string) => {
    const el = scrollRef.current?.querySelector(`#${id}`);
    el?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div ref={scrollRef} className="relative h-full overflow-y-auto bg-dreamloom-bg text-dreamloom-text">
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute inset-0 bg-[linear-gradient(180deg,#0a0a1a_0%,#12122a_60%,#0a0a1a_100%)]" />
        <motion.div
          className="absolute -top-40 left-1/2 h-[500px] w-[900px] -translate-x-1/2 rounded-full blur-3xl"
          style={{
            background:
              "radial-gradient(circle, rgba(245,158,11,0.18) 0%, rgba(124,58,237,0.08) 45%, transparent 75%)",
          }}
          animate={{ scale: [1, 1.05, 1], opacity: [0.8, 1, 0.8] }}
          transition={{ duration: 16, repeat: Infinity, ease: "easeInOut" }}
        />
        <div className="film-grain absolute inset-0 opacity-40" />
      </div>

      <div className="relative z-20">
        <div className="border-b border-dreamloom-gold/20 bg-dreamloom-surface/80 px-4 py-2 text-center backdrop-blur-md">
          <p className="font-body text-[11px] uppercase tracking-[0.22em] text-dreamloom-gold/85">
            Built for Gemini Live Agent Challenge - Creative Storyteller
          </p>
        </div>

        <motion.nav
          className="sticky top-0 z-40 flex items-center justify-between gap-4 border-b px-4 py-3 backdrop-blur-lg sm:px-8"
          style={{
            borderColor: navSolid ? "rgba(255,255,255,0.08)" : "transparent",
            backgroundColor: navSolid ? "rgba(10,10,26,0.82)" : "rgba(10,10,26,0.38)",
          }}
        >
          <div className="flex items-center gap-2">
            <span className="font-display text-2xl text-white">Dream</span>
            <span className="bg-gradient-to-r from-dreamloom-gold to-amber-600 bg-clip-text font-display text-2xl text-transparent">
              Loom
            </span>
            <span className="hidden font-body text-xs uppercase tracking-[0.18em] text-dreamloom-muted md:inline">
              AI Story Studio
            </span>
          </div>

          <div className="hidden items-center gap-4 lg:flex">
            {navLinks.map((link) => (
              <button
                key={link.id}
                onClick={() => scrollTo(link.id)}
                className="font-body text-sm text-dreamloom-text/70 transition-colors hover:text-dreamloom-gold"
              >
                {link.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onStart}
              disabled={isConnecting}
              className="rounded-full bg-dreamloom-gold px-4 py-1.5 font-body text-sm font-semibold text-dreamloom-bg transition-colors hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-60 sm:px-5 sm:py-2"
            >
              {isConnecting ? "Connecting..." : "Begin Your Story"}
            </button>
            <button
              onClick={() => setMobileMenuOpen((o) => !o)}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 text-dreamloom-text/70 transition-colors hover:border-white/20 hover:text-white lg:hidden"
              aria-label="Toggle menu"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                {mobileMenuOpen ? (
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
            </button>
          </div>
        </motion.nav>

        {/* Mobile nav menu */}
        {mobileMenuOpen && (
          <div className="sticky top-12 z-30 border-b border-white/10 bg-dreamloom-bg/95 px-4 py-3 backdrop-blur-lg lg:hidden">
            <div className="flex flex-col gap-2">
              {navLinks.map((link) => (
                <button
                  key={link.id}
                  onClick={() => {
                    scrollTo(link.id);
                    setMobileMenuOpen(false);
                  }}
                  className="rounded-lg px-3 py-2 text-left font-body text-sm text-dreamloom-text/70 transition-colors hover:bg-white/5 hover:text-dreamloom-gold"
                >
                  {link.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <section className="px-6 pb-16 pt-16 sm:px-10 sm:pt-20">
          <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[1fr_1fr] lg:items-center">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55 }}
            >
              <p className="mb-4 font-body text-xs uppercase tracking-[0.22em] text-dreamloom-accent-light/80">
                Voice-first storytelling for kids, families, and non-writers
              </p>
              <h1 className="font-display text-3xl leading-[1.08] text-white sm:text-5xl md:text-6xl">
                Turn spoken imagination into a living storybook.
              </h1>
              <p className="mt-6 max-w-xl font-body text-base leading-relaxed text-dreamloom-text/80 sm:text-lg">
                DreamLoom is an AI creative director that listens, responds, remembers, and
                illustrates in real time. Speak an idea, interrupt naturally, show a sketch,
                and watch scenes, narration, and music come together as one experience.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <button
                  onClick={onStart}
                  disabled={isConnecting}
                  className="rounded-full bg-gradient-to-r from-dreamloom-gold to-amber-600 px-5 py-2.5 font-display text-base text-dreamloom-bg shadow-[0_0_40px_rgba(245,158,11,0.25)] transition-transform hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-60 sm:px-7 sm:py-3 sm:text-lg"
                >
                  {isConnecting ? "Connecting..." : "Begin Your Story"}
                </button>
                <button
                  onClick={() => scrollTo("moments")}
                  className="rounded-full border border-white/15 px-7 py-3 font-body text-sm text-dreamloom-text/85 transition-colors hover:border-dreamloom-gold/40 hover:text-white"
                >
                  See Signature Moments
                </button>
              </div>
              <div className="mt-8 flex flex-wrap gap-2.5">
                {PROOF_CHIPS.map((chip) => (
                  <span
                    key={chip}
                    className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 font-body text-xs text-dreamloom-text/75"
                  >
                    {chip}
                  </span>
                ))}
              </div>
            </motion.div>
            <ProductPreviewCard />
          </div>
        </section>

        <Section id="why" eyebrow="Why DreamLoom" title="Most story tools ask you to write. DreamLoom lets you create by speaking.">
          <div className="grid gap-4 md:grid-cols-3">
            {BENEFITS.map((item) => (
              <motion.div
                key={item.title}
                className="rounded-2xl border border-white/10 bg-white/[0.03] p-5"
                initial={{ opacity: 0, y: 18 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.25 }}
                transition={{ duration: 0.45 }}
              >
                <h3 className="font-display text-2xl text-dreamloom-gold">{item.title}</h3>
                <p className="mt-3 font-body text-sm leading-relaxed text-dreamloom-text/80">
                  {item.body}
                </p>
              </motion.div>
            ))}
          </div>
        </Section>

        {onStartWithTemplate && (
          <Section id="templates" eyebrow="Quick Start" title="Choose a launch path and begin in one tap">
            <div className="grid gap-4 md:grid-cols-3">
              {TEMPLATES.map((template) => (
                <motion.button
                  key={template.title}
                  onClick={() => onStartWithTemplate(template.prompt)}
                  disabled={isConnecting}
                  className={`relative overflow-hidden rounded-2xl border bg-gradient-to-br p-5 text-left transition-transform hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60 ${template.toneClass}`}
                  initial={{ opacity: 0, y: 18 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.25 }}
                  transition={{ duration: 0.45 }}
                >
                  <p className="font-body text-xs uppercase tracking-[0.2em] text-dreamloom-muted/90">
                    {template.audience}
                  </p>
                  <h3 className="mt-2 font-display text-3xl text-white">{template.title}</h3>
                  <p className="mt-3 font-body text-sm text-dreamloom-text/80">
                    {template.description}
                  </p>
                  <span className="mt-5 inline-flex items-center gap-1 font-body text-xs font-medium text-dreamloom-gold">
                    Start this flow <ChevronIcon className="h-4 w-4" />
                  </span>
                </motion.button>
              ))}
            </div>
          </Section>
        )}

        <GallerySection stories={gallery.stories} fetchStory={gallery.fetchStory} />

        <Section id="moments" eyebrow="Signature Moments" title="What makes DreamLoom feel different">
          <div className="grid gap-4 md:grid-cols-2">
            {SIGNATURE_MOMENTS.map((moment) => (
              <motion.div
                key={moment.title}
                className="rounded-2xl border border-white/10 bg-dreamloom-surface/70 p-5"
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.25 }}
                transition={{ duration: 0.45 }}
              >
                <h3 className="font-display text-3xl text-white">{moment.title}</h3>
                <p className="mt-3 font-body text-sm leading-relaxed text-dreamloom-text/80">
                  {moment.body}
                </p>
              </motion.div>
            ))}
          </div>
        </Section>

        <Section id="how" eyebrow="How It Works" title="Three steps from idea to storybook">
          <div className="grid gap-4 md:grid-cols-3">
            {HOW_STEPS.map((step, index) => (
              <motion.div
                key={step.title}
                className="rounded-2xl border border-white/10 bg-white/[0.03] p-5"
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.25 }}
                transition={{ duration: 0.45, delay: index * 0.08 }}
              >
                <div className="mb-3 inline-flex h-8 w-8 items-center justify-center rounded-full bg-dreamloom-gold font-body text-xs font-bold text-dreamloom-bg">
                  {index + 1}
                </div>
                <h3 className="font-display text-3xl text-white">{step.title}</h3>
                <p className="mt-3 font-body text-sm text-dreamloom-text/80">{step.body}</p>
              </motion.div>
            ))}
          </div>
        </Section>

        <Section id="underhood" eyebrow="Under The Hood" title="Built to prove live multimodal storytelling">
          <div className="rounded-2xl border border-white/10 bg-dreamloom-surface/80 p-6">
            <ul className="grid gap-3 font-body text-sm text-dreamloom-text/85 md:grid-cols-2">
              {UNDER_HOOD.map((item) => (
                <li key={item} className="flex items-start gap-3">
                  <span className="mt-1 h-2 w-2 flex-shrink-0 rounded-full bg-dreamloom-gold" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </Section>

        <Section id="library" eyebrow="Your Stories" title="Resume your recent sessions">
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
            <div className="rounded-2xl border border-dashed border-white/15 bg-white/[0.02] p-8 text-center">
              <p className="font-display text-2xl text-white/80">
                No stories yet. Start your first one now.
              </p>
              {sessionsLoading && (
                <p className="mt-2 font-body text-xs text-dreamloom-muted">Loading...</p>
              )}
            </div>
          )}
          {sessionsLoading && previousSessions.length > 0 && (
            <p className="mt-4 font-body text-xs text-dreamloom-muted">Refreshing sessions...</p>
          )}
        </Section>

        <Section id="cut" eyebrow="Director's Cut" title="Start with a sentence. Leave with a story world.">
          <div className="rounded-3xl border border-dreamloom-gold/25 bg-gradient-to-br from-dreamloom-gold/10 via-transparent to-dreamloom-accent/10 p-8 text-center">
            <p className="mx-auto max-w-2xl font-body text-base leading-relaxed text-dreamloom-text/85">
              DreamLoom helps imagination move at the speed of conversation. End each story
              with cover art, logline, trailer voiceover, and an animatic-ready finale.
            </p>
            <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
              <button
                onClick={onStart}
                disabled={isConnecting}
                className="rounded-full bg-dreamloom-gold px-7 py-3 font-display text-lg text-dreamloom-bg transition-colors hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isConnecting ? "Connecting..." : "Begin Your Story"}
              </button>
              <button
                onClick={() => scrollTo("moments")}
                className="rounded-full border border-white/15 px-7 py-3 font-body text-sm text-dreamloom-text/85 transition-colors hover:border-dreamloom-gold/45 hover:text-white"
              >
                Watch Demo Flow
              </button>
            </div>
          </div>
        </Section>

        <footer className="border-t border-white/10 px-6 py-8 text-center sm:px-10">
          <p className="font-body text-xs uppercase tracking-[0.18em] text-dreamloom-muted">
            DreamLoom - Voice-first AI story studio powered by Gemini + Google Cloud
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

/**
 * useAnimatic — client-side WebM assembly from story pages.
 *
 * Uses setInterval-based rendering (NOT requestAnimationFrame) so that
 * generation continues even when the tab is backgrounded.
 *
 * Audio pipeline: all audio (music + AI narration) routes through a single
 * AudioContext → MediaStreamDestination so MediaRecorder captures it.
 * Narration is generated via Gemini TTS on the backend.
 */
import { useCallback, useRef, useState } from "react";
import type { StoryPage } from "../types";
import { fetchTTSBatch } from "../services/tts";

const LOG_PREFIX = "[Animatic]";
function log(...args: unknown[]) { console.log(LOG_PREFIX, ...args); }
function warn(...args: unknown[]) { console.warn(LOG_PREFIX, ...args); }

interface AnimaticOptions {
  /** Minimum seconds per scene (extended if narration is longer) */
  sceneDuration?: number;
  /** Crossfade transition duration in seconds */
  transitionDuration?: number;
  /** Canvas width */
  width?: number;
  /** Canvas height */
  height?: number;
}

interface KenBurns {
  startScale: number;
  endScale: number;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

function randomKenBurns(): KenBurns {
  // Always start fully zoomed out (1.0 = full image visible),
  // then slowly zoom in to 1.10 with a gentle pan.
  const angle = Math.random() * Math.PI * 2;
  const dist = 0.015;
  return {
    startScale: 1.0,
    endScale: 1.10,
    startX: -Math.cos(angle) * dist,
    startY: -Math.sin(angle) * dist,
    endX: Math.cos(angle) * dist,
    endY: Math.sin(angle) * dist,
  };
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}

function drawTextWithShadow(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  color = "rgba(255,255,255,0.95)",
) {
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.8)";
  ctx.shadowBlur = 8;
  ctx.shadowOffsetX = 2;
  ctx.shadowOffsetY = 2;
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
  ctx.restore();
}

function drawWrappedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  cx: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  color?: string,
): number {
  const words = text.split(" ");
  const lines: string[] = [];
  let currentLine = "";
  for (const word of words) {
    const test = currentLine ? `${currentLine} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth) {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = test;
    }
  }
  if (currentLine) lines.push(currentLine);

  ctx.textAlign = "center";
  for (let i = 0; i < lines.length; i++) {
    drawTextWithShadow(ctx, lines[i], cx, y + i * lineHeight, color);
  }
  return lines.length;
}

interface SceneEntry {
  image: HTMLImageElement;
  subtitle: string;
  title: string;
  sceneNumber: number;
  musicUrl?: string;
  kenBurns: KenBurns;
}

export function useAnimatic(options: AnimaticOptions = {}) {
  const {
    sceneDuration = 5,
    transitionDuration = 1,
    width = 1280,
    height = 720,
  } = options;

  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const cancelRef = useRef(false);

  const generate = useCallback(
    async (pages: StoryPage[]) => {
      if (generating || pages.length === 0) return null;

      log("=== VIDEO GENERATION STARTED ===");
      log(`Input: ${pages.length} pages`);
      setGenerating(true);
      setProgress(0);
      setBlobUrl(null);
      cancelRef.current = false;

      try {
        // ── 1. Load scene images ──
        log("Step 1: Loading scene images...");
        const sceneData: SceneEntry[] = [];

        for (const page of pages) {
          let imgUrl = page.imageUrl;
          if (!imgUrl) {
            for (const block of page.blocks) {
              if (block.type === "image" && block.url) {
                imgUrl = block.url;
                break;
              }
            }
          }
          if (imgUrl) {
            log(`  Scene ${page.sceneNumber}: loading image from ${imgUrl.slice(0, 80)}...`);
            const img = new Image();
            img.crossOrigin = "anonymous";
            let loaded = false;
            await new Promise<void>((resolve) => {
              img.onload = () => { loaded = true; resolve(); };
              img.onerror = () => {
                warn(`  Scene ${page.sceneNumber}: CORS failed, retrying without crossOrigin`);
                const img2 = new Image();
                img2.onload = () => {
                  Object.defineProperty(img, "naturalWidth", { value: img2.naturalWidth });
                  Object.defineProperty(img, "naturalHeight", { value: img2.naturalHeight });
                  loaded = false;
                  resolve();
                };
                img2.onerror = () => { warn(`  Scene ${page.sceneNumber}: image load failed entirely`); resolve(); };
                img2.src = imgUrl!;
              };
              img.src = imgUrl!;
            });

            if (!loaded || img.naturalWidth === 0) {
              warn(`  Scene ${page.sceneNumber}: SKIPPED (image not usable, loaded=${loaded}, w=${img.naturalWidth})`);
              continue;
            }

            log(`  Scene ${page.sceneNumber}: image loaded OK (${img.naturalWidth}x${img.naturalHeight})`);

            const fullNarration =
              page.narration ||
              page.blocks
                .filter((b) => b.type === "text")
                .map((b) => b.content)
                .join(" ");

            // ~14 chars/sec for natural TTS narration, target ~14s of audio
            const maxChars = 200;
            const ttsText = fullNarration.length > maxChars
              ? (fullNarration.slice(0, maxChars).replace(/[^.!?]*$/, '').trim()
                 || fullNarration.slice(0, fullNarration.lastIndexOf(" ", maxChars))
                 || fullNarration.slice(0, maxChars))
              : fullNarration;

            log(`  Scene ${page.sceneNumber}: narration text = "${ttsText.slice(0, 80)}..." (${ttsText.length} chars)`);
            log(`  Scene ${page.sceneNumber}: musicUrl = ${page.musicUrl || "(none)"}`);

            sceneData.push({
              image: img,
              subtitle: ttsText,
              title: page.title || `Scene ${page.sceneNumber}`,
              sceneNumber: page.sceneNumber,
              musicUrl: page.musicUrl,
              kenBurns: randomKenBurns(),
            });
          } else {
            warn(`  Scene ${page.sceneNumber}: SKIPPED (no image URL found)`);
          }
        }

        log(`Step 1 done: ${sceneData.length}/${pages.length} scenes have usable images`);

        if (sceneData.length === 0) {
          warn("No scenes with images — aborting video generation");
          setGenerating(false);
          return null;
        }

        // ── 2. Fetch AI narration (sequentially to avoid API overload) ──
        log("Step 2: Fetching TTS narration...");
        setProgress(2);
        const narrationWavs: (ArrayBuffer | null)[] = [];
        for (let i = 0; i < sceneData.length; i++) {
          const scene = sceneData[i];
          log(`  TTS ${i + 1}/${sceneData.length}: "${scene.subtitle.slice(0, 60)}..." (${scene.subtitle.length} chars)`);
          setProgress(2 + Math.round((i / sceneData.length) * 18));
          const startMs = performance.now();
          const wav = await fetchTTSBatch([scene.subtitle]);
          const elapsed = Math.round(performance.now() - startMs);
          if (wav[0]) {
            log(`  TTS ${i + 1}: OK — ${wav[0].byteLength} bytes in ${elapsed}ms`);
          } else {
            warn(`  TTS ${i + 1}: FAILED after ${elapsed}ms`);
          }
          narrationWavs.push(wav[0]);
        }
        const ttsSuccess = narrationWavs.filter(Boolean).length;
        log(`Step 2 done: TTS ${ttsSuccess}/${sceneData.length} succeeded`);
        if (ttsSuccess === 0) {
          warn("All TTS requests failed — video will have NO narration voice");
        }

        // ── 3. Setup audio pipeline ──
        log("Step 3: Setting up audio pipeline...");
        const audioCtx = new AudioContext();
        // Ensure AudioContext is running (can be suspended by browser policy)
        if (audioCtx.state === "suspended") {
          log("  AudioContext suspended, resuming...");
          await audioCtx.resume();
        }
        log(`  AudioContext: sampleRate=${audioCtx.sampleRate}, state=${audioCtx.state}`);
        const streamDest = audioCtx.createMediaStreamDestination();

        // Decode narration WAVs
        const narrationBuffers: (AudioBuffer | null)[] = await Promise.all(
          narrationWavs.map(async (wav, i) => {
            if (!wav) return null;
            try {
              // decodeAudioData consumes the ArrayBuffer, so copy it
              const copy = wav.slice(0);
              const buf = await audioCtx.decodeAudioData(copy);
              log(`  Decoded narration ${i + 1}: ${buf.duration.toFixed(1)}s, ${buf.numberOfChannels}ch, ${buf.sampleRate}Hz`);
              return buf;
            } catch (err) {
              warn(`  Decode narration ${i + 1} FAILED:`, err);
              return null;
            }
          }),
        );

        // Decode per-scene music
        const uniqueMusicUrls = [...new Set(sceneData.map((s) => s.musicUrl).filter(Boolean))] as string[];
        log(`  Loading ${uniqueMusicUrls.length} unique music tracks...`);
        const musicBufferMap = new Map<string, AudioBuffer>();
        await Promise.all(
          uniqueMusicUrls.map(async (url) => {
            try {
              const resp = await fetch(url);
              if (!resp.ok) { warn(`  Music fetch failed: ${resp.status} for ${url.slice(0, 60)}`); return; }
              const buf = await resp.arrayBuffer();
              const decoded = await audioCtx.decodeAudioData(buf);
              log(`  Music decoded: ${url.slice(0, 60)}... → ${decoded.duration.toFixed(1)}s`);
              musicBufferMap.set(url, decoded);
            } catch (err) {
              warn(`  Music decode failed: ${url.slice(0, 60)}...`, err);
            }
          }),
        );
        log(`Step 3 done: ${narrationBuffers.filter(Boolean).length} narrations, ${musicBufferMap.size} music tracks`);

        // ── 4. Compute per-scene durations ──
        // Each scene lasts at least sceneDuration, extended to fit full narration + 1.5s padding
        const minSceneMs = sceneDuration * 1000;
        const sceneDurations = sceneData.map((scene, i) => {
          const narBuf = narrationBuffers[i];
          if (narBuf) {
            const narMs = Math.ceil(narBuf.duration * 1000) + transitionMs + 2000;
            const dur = Math.max(minSceneMs, narMs);
            log(`  Scene ${i + 1} ("${scene.title}"): ${dur}ms (narration=${narBuf.duration.toFixed(1)}s)`);
            return dur;
          }
          log(`  Scene ${i + 1} ("${scene.title}"): ${minSceneMs}ms (no narration, using minimum)`);
          return minSceneMs;
        });

        const letterboxHeight = 50;
        const titleDurationMs = 3000;
        const transitionMs = transitionDuration * 1000;
        const endDurationMs = 2000;

        const sceneStartOffsets: number[] = [];
        let cum = 0;
        for (const dur of sceneDurations) {
          sceneStartOffsets.push(cum);
          cum += dur;
        }
        const allScenesMs = cum;
        const totalMs = titleDurationMs + allScenesMs + endDurationMs;

        log("Step 4: Timing plan:");
        log(`  Title card: 0 → ${titleDurationMs}ms`);
        sceneData.forEach((scene, i) => {
          const start = titleDurationMs + sceneStartOffsets[i];
          const end = start + sceneDurations[i];
          log(`  Scene ${i + 1} ("${scene.title}"): ${start} → ${end}ms (${sceneDurations[i]}ms)`);
        });
        log(`  End card: ${titleDurationMs + allScenesMs} → ${totalMs}ms`);
        log(`  Total video duration: ${(totalMs / 1000).toFixed(1)}s`);

        // ── 5. Setup canvas + MediaRecorder ──
        log("Step 5: Setting up canvas & MediaRecorder...");
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d")!;

        const videoStream = canvas.captureStream(30);
        streamDest.stream
          .getAudioTracks()
          .forEach((track) => videoStream.addTrack(track));

        const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
          ? "video/webm;codecs=vp9"
          : "video/webm";

        log(`  Canvas: ${width}x${height}, mimeType=${mimeType}`);

        const recorder = new MediaRecorder(videoStream, {
          mimeType,
          videoBitsPerSecond: 3_000_000,
        });

        const chunks: Blob[] = [];
        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunks.push(e.data);
        };
        recorder.onerror = (e) => {
          warn("MediaRecorder error:", e);
        };
        const recordingDone = new Promise<Blob>((resolve) => {
          recorder.onstop = () =>
            resolve(new Blob(chunks, { type: mimeType }));
        });

        recorder.start(1000); // Collect data every 1s for incremental chunks
        log("  MediaRecorder started (1s intervals)");

        // ── 6. Per-scene music setup ──
        let currentMusicSource: AudioBufferSourceNode | null = null;
        let currentMusicGain: GainNode | null = null;
        let lastMusicUrl = "";

        function switchMusic(url: string | undefined) {
          const targetUrl = url || "";
          if (targetUrl === lastMusicUrl) return;

          if (currentMusicSource && currentMusicGain) {
            log(`  Music: fading out ${lastMusicUrl.slice(0, 40)}...`);
            const oldGain = currentMusicGain;
            const oldSource = currentMusicSource;
            oldGain.gain.setTargetAtTime(0, audioCtx.currentTime, 0.3);
            setTimeout(() => {
              try { oldSource.stop(); } catch { /* ok */ }
            }, 500);
          }
          currentMusicSource = null;
          currentMusicGain = null;
          lastMusicUrl = targetUrl;

          if (targetUrl && musicBufferMap.has(targetUrl)) {
            log(`  Music: starting ${targetUrl.slice(0, 40)}...`);
            const buf = musicBufferMap.get(targetUrl)!;
            const src = audioCtx.createBufferSource();
            src.buffer = buf;
            src.loop = true;
            const gain = audioCtx.createGain();
            gain.gain.setValueAtTime(0, audioCtx.currentTime);
            gain.gain.setTargetAtTime(0.35, audioCtx.currentTime, 0.3);
            src.connect(gain);
            gain.connect(streamDest);
            src.start();
            currentMusicSource = src;
            currentMusicGain = gain;
          } else if (targetUrl) {
            warn(`  Music: buffer not found for ${targetUrl.slice(0, 40)}...`);
          }
        }

        // ── 7. Drawing helpers ──
        function drawScene(scene: SceneEntry, t: number, opacity: number) {
          const kb = scene.kenBurns;
          const et = easeInOut(t);
          const scale = lerp(kb.startScale, kb.endScale, et);
          const panX = lerp(kb.startX, kb.endX, et);
          const panY = lerp(kb.startY, kb.endY, et);

          const imgScale =
            Math.max(width / scene.image.width, height / scene.image.height) *
            scale;
          const dw = scene.image.width * imgScale;
          const dh = scene.image.height * imgScale;
          const cx = (width - dw) / 2 + panX * width;
          const cy = (height - dh) / 2 + panY * height;

          ctx.globalAlpha = opacity;
          ctx.drawImage(scene.image, cx, cy, dw, dh);
          ctx.globalAlpha = 1;
        }

        function findScene(afterTitleMs: number): {
          idx: number;
          frameInScene: number;
          sceneDur: number;
        } {
          for (let i = 0; i < sceneData.length; i++) {
            const start = sceneStartOffsets[i];
            const dur = sceneDurations[i];
            if (afterTitleMs < start + dur) {
              return { idx: i, frameInScene: afterTitleMs - start, sceneDur: dur };
            }
          }
          const lastIdx = sceneData.length - 1;
          return {
            idx: lastIdx,
            frameInScene: sceneDurations[lastIdx],
            sceneDur: sceneDurations[lastIdx],
          };
        }

        // ── 8. Render loop using setInterval (works in background tabs!) ──
        log("Step 6: Starting render loop (setInterval @ 33ms)...");
        const startTime = performance.now();
        let lastNarrationScene = -1;
        let currentNarrationNode: AudioBufferSourceNode | null = null;
        let currentNarrationGain: GainNode | null = null;
        let frameCount = 0;

        await new Promise<void>((resolve) => {
          const intervalId = setInterval(() => {
            try {
              if (cancelRef.current) {
                warn("Render cancelled by user");
                clearInterval(intervalId);
                resolve();
                return;
              }

              frameCount++;
              const elapsedMs = performance.now() - startTime;
              const clampedMs = Math.min(elapsedMs, totalMs);

              // Update progress every ~30 frames to avoid excessive re-renders
              if (frameCount % 30 === 0) {
                setProgress(20 + Math.round((clampedMs / totalMs) * 80));
              }

              // ── Title card ──
              if (clampedMs < titleDurationMs) {
                const t = clampedMs / titleDurationMs;
                const fadeIn = Math.min(t * 3, 1);

                ctx.fillStyle = "#0a0a1a";
                ctx.fillRect(0, 0, width, height);
                ctx.globalAlpha = fadeIn;

                ctx.strokeStyle = "rgba(245, 158, 11, 0.5)";
                ctx.lineWidth = 1;
                const lineW = width * 0.3 * fadeIn;
                ctx.beginPath();
                ctx.moveTo(width / 2 - lineW, height / 2 - 30);
                ctx.lineTo(width / 2 + lineW, height / 2 - 30);
                ctx.stroke();

                ctx.font = "bold 48px system-ui, sans-serif";
                ctx.textAlign = "center";
                drawTextWithShadow(
                  ctx,
                  "DreamLoom",
                  width / 2,
                  height / 2 + 10,
                  "rgba(245, 158, 11, 0.95)",
                );

                ctx.font = "20px system-ui, sans-serif";
                drawTextWithShadow(
                  ctx,
                  "A story woven by voice and imagination",
                  width / 2,
                  height / 2 + 50,
                  "rgba(200, 200, 220, 0.7)",
                );

                ctx.globalAlpha = 1;

              // ── Scenes ──
              } else if (clampedMs < titleDurationMs + allScenesMs) {
                const afterTitle = clampedMs - titleDurationMs;
                const { idx: sceneIdx, frameInScene, sceneDur } =
                  findScene(afterTitle);
                const t = frameInScene / sceneDur;
                const scene = sceneData[sceneIdx];
                const prevScene = sceneIdx > 0 ? sceneData[sceneIdx - 1] : null;

                // Start narration and switch music when entering a new scene
                if (sceneIdx !== lastNarrationScene) {
                  lastNarrationScene = sceneIdx;
                  log(`▶ Entering scene ${sceneIdx + 1}/${sceneData.length}: "${scene.title}" (at ${(clampedMs / 1000).toFixed(1)}s, frame ${frameCount})`);

                  switchMusic(scene.musicUrl);

                  if (currentNarrationNode) {
                    // Fade out over 150ms to avoid audio pop, then stop after 300ms
                    const oldNarNode = currentNarrationNode;
                    if (currentNarrationGain) {
                      currentNarrationGain.gain.setTargetAtTime(0, audioCtx.currentTime, 0.05);
                    }
                    setTimeout(() => {
                      try { oldNarNode.stop(); } catch { /* ok */ }
                    }, 300);
                    currentNarrationNode = null;
                    currentNarrationGain = null;
                  }

                  const narBuf = narrationBuffers[sceneIdx];
                  if (narBuf) {
                    log(`  Playing narration: ${narBuf.duration.toFixed(1)}s`);
                    if (currentMusicGain) {
                      currentMusicGain.gain.setTargetAtTime(0.22, audioCtx.currentTime, 0.2);
                      log(`  Music ducked to 0.22 for narration`);
                    }
                    const src = audioCtx.createBufferSource();
                    src.buffer = narBuf;
                    const narGain = audioCtx.createGain();
                    narGain.gain.value = 0.9;
                    src.connect(narGain);
                    narGain.connect(streamDest);
                    src.start();
                    currentNarrationNode = src;
                    currentNarrationGain = narGain;
                    src.onended = () => {
                      log(`  Narration ended for scene ${sceneIdx + 1}`);
                      if (currentMusicGain) {
                        currentMusicGain.gain.setTargetAtTime(0.35, audioCtx.currentTime, 0.3);
                      }
                    };
                  } else {
                    warn(`  No narration audio for scene ${sceneIdx + 1} — silent`);
                  }
                }

                ctx.fillStyle = "#0a0a1a";
                ctx.fillRect(0, 0, width, height);

                // Draw scenes with crossfade
                try {
                  if (prevScene && frameInScene < transitionMs) {
                    const crossT = frameInScene / transitionMs;
                    drawScene(prevScene, 1, 1 - crossT);
                  }

                  const inOpacity =
                    frameInScene < transitionMs ? frameInScene / transitionMs : 1;
                  const outOpacity =
                    frameInScene > sceneDur - transitionMs
                      ? (sceneDur - frameInScene) / transitionMs
                      : 1;
                  const sceneOpacity = Math.min(inOpacity, outOpacity);
                  drawScene(scene, t, sceneOpacity);

                  // Letterbox
                  ctx.fillStyle = "#0a0a1a";
                  ctx.fillRect(0, 0, width, letterboxHeight);
                  ctx.fillRect(0, height - letterboxHeight, width, letterboxHeight);

                  // Scene title
                  ctx.font = "bold 14px system-ui, sans-serif";
                  ctx.textAlign = "left";
                  drawTextWithShadow(
                    ctx,
                    scene.title,
                    24,
                    30,
                    `rgba(245, 158, 11, ${sceneOpacity * 0.8})`,
                  );

                  // Subtitle gradient
                  const subtitleText =
                    scene.subtitle.length > 150
                      ? scene.subtitle.slice(0, 147) + "..."
                      : scene.subtitle;

                  const grad = ctx.createLinearGradient(
                    0,
                    height - letterboxHeight - 120,
                    0,
                    height - letterboxHeight,
                  );
                  grad.addColorStop(0, "rgba(0,0,0,0)");
                  grad.addColorStop(1, "rgba(0,0,0,0.7)");
                  ctx.fillStyle = grad;
                  ctx.fillRect(0, height - letterboxHeight - 120, width, 120);

                  if (subtitleText) {
                    ctx.font = "18px system-ui, sans-serif";
                    drawWrappedText(
                      ctx,
                      subtitleText,
                      width / 2,
                      height - letterboxHeight - 55,
                      width - 120,
                      24,
                    );
                  }
                } catch (drawErr) {
                  warn(`  drawScene error at scene ${sceneIdx}:`, drawErr);
                }

              // ── End card ──
              } else {
                const endElapsed = clampedMs - titleDurationMs - allScenesMs;
                const t = endElapsed / endDurationMs;
                const fadeIn = Math.min(t * 3, 1);
                const fadeOut = Math.min((1 - t) * 3, 1);

                ctx.fillStyle = "#0a0a1a";
                ctx.fillRect(0, 0, width, height);
                ctx.globalAlpha = Math.min(fadeIn, fadeOut);

                ctx.font = "bold 36px system-ui, sans-serif";
                ctx.textAlign = "center";
                drawTextWithShadow(
                  ctx,
                  "The End",
                  width / 2,
                  height / 2,
                  "rgba(245, 158, 11, 0.9)",
                );

                ctx.font = "16px system-ui, sans-serif";
                drawTextWithShadow(
                  ctx,
                  `${sceneData.length} scenes woven by DreamLoom`,
                  width / 2,
                  height / 2 + 40,
                  "rgba(200, 200, 220, 0.6)",
                );

                ctx.globalAlpha = 1;
              }

              if (elapsedMs >= totalMs) {
                log(`Render loop complete: ${frameCount} frames in ${(elapsedMs / 1000).toFixed(1)}s`);
                clearInterval(intervalId);
                resolve();
              }
            } catch (frameErr) {
              warn("Frame render error (continuing):", frameErr);
            }
          }, 33); // ~30fps
        });

        // ── 9. Cleanup & finalize ──
        log("Step 7: Finalizing...");
        if (currentNarrationNode) {
          try { (currentNarrationNode as AudioBufferSourceNode).stop(); } catch { /* ok */ }
        }
        if (currentMusicSource) {
          try { (currentMusicSource as AudioBufferSourceNode).stop(); } catch { /* ok */ }
        }
        audioCtx.close().catch(() => {});

        recorder.stop();
        log("  MediaRecorder stopped, waiting for blob...");
        const blob = await recordingDone;
        const url = URL.createObjectURL(blob);
        log("=== VIDEO GENERATION COMPLETE ===");
        log(`  Blob size: ${(blob.size / 1024 / 1024).toFixed(2)} MB`);
        log(`  Duration: ${(totalMs / 1000).toFixed(1)}s`);
        log(`  Frames rendered: ${frameCount}`);
        log(`  Scenes: ${sceneData.length}, Narrations: ${narrationBuffers.filter(Boolean).length}, Music: ${musicBufferMap.size}`);
        setBlobUrl(url);
        setProgress(100);
        setGenerating(false);
        return url;
      } catch (err) {
        console.error(LOG_PREFIX, "GENERATION FAILED:", err);
        setGenerating(false);
        return null;
      }
    },
    [generating, sceneDuration, transitionDuration, width, height],
  );

  return { generate, generating, progress, blobUrl };
}

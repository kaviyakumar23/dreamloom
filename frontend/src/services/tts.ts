/**
 * TTS service — fetches AI-generated narration audio from the backend.
 * Uses Gemini TTS (gemini-2.5-flash-preview-tts) for natural human-sounding voice.
 * Returns WAV ArrayBuffers that can be decoded by Web Audio API.
 */

const API_BASE = import.meta.env.VITE_API_URL || window.location.origin;

const MAX_RETRIES = 3;
const BASE_TIMEOUT_MS = 30_000;

/**
 * Fetch TTS audio for a single text string with retry + exponential backoff.
 * Returns an ArrayBuffer (WAV) or null after all retries exhausted.
 */
export async function fetchTTS(
  text: string,
  voice: string = "Kore",
): Promise<ArrayBuffer | null> {
  if (!text.trim()) return null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const controller = new AbortController();
      // Increase timeout on each retry: 30s, 45s, 60s
      const timeoutMs = BASE_TIMEOUT_MS + attempt * 15_000;
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      const resp = await fetch(`${API_BASE}/api/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, voice }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (resp.ok) {
        const buf = await resp.arrayBuffer();
        console.log(`TTS OK (attempt ${attempt + 1}): ${text.slice(0, 60)}... → ${buf.byteLength} bytes`);
        return buf;
      }

      // Retry on server errors (5xx), give up on client errors (4xx)
      if (resp.status < 500) {
        console.warn(`TTS request failed (${resp.status}) — not retryable`);
        return null;
      }
      console.warn(`TTS request failed (${resp.status}), attempt ${attempt + 1}/${MAX_RETRIES}`);
    } catch (err) {
      const isTimeout = err instanceof DOMException && err.name === "AbortError";
      console.warn(
        `TTS ${isTimeout ? "timeout" : "error"} (attempt ${attempt + 1}/${MAX_RETRIES}):`,
        isTimeout ? "request timed out" : err,
      );
    }

    // Exponential backoff before retry: 1s, 2s (skip delay after last attempt)
    if (attempt < MAX_RETRIES - 1) {
      const delayMs = 1000 * Math.pow(2, attempt);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }

  console.warn(`TTS failed after ${MAX_RETRIES} attempts: ${text.slice(0, 60)}...`);
  return null;
}

/**
 * Fetch TTS audio for multiple texts in parallel.
 * Returns an array matching the input length (null entries on failure).
 */
export async function fetchTTSBatch(
  texts: string[],
  voice: string = "Kore",
): Promise<(ArrayBuffer | null)[]> {
  return Promise.all(texts.map((t) => fetchTTS(t, voice)));
}

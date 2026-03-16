/**
 * TTS service — fetches AI-generated narration audio from the backend.
 * Uses Gemini TTS (gemini-2.5-flash-preview-tts) for natural human-sounding voice.
 * Returns WAV ArrayBuffers that can be decoded by Web Audio API.
 */

const API_BASE = import.meta.env.VITE_API_URL || window.location.origin;

/**
 * Fetch TTS audio for a single text string.
 * Returns an ArrayBuffer (WAV) or null on failure.
 */
export async function fetchTTS(
  text: string,
  voice: string = "Kore",
): Promise<ArrayBuffer | null> {
  if (!text.trim()) return null;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30_000);
    const resp = await fetch(`${API_BASE}/api/tts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, voice }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (!resp.ok) {
      console.warn(`TTS request failed: ${resp.status} ${resp.statusText}`);
      return null;
    }
    const buf = await resp.arrayBuffer();
    console.log(`TTS OK: ${text.slice(0, 60)}... → ${buf.byteLength} bytes`);
    return buf;
  } catch (err) {
    console.warn("TTS fetch error:", err);
    return null;
  }
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

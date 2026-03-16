/**
 * Audio playback hook — plays PCM audio data from WebSocket.
 */
import { useCallback, useEffect, useRef, useState } from "react";

interface UseAudioPlaybackOptions {
  sampleRate?: number;
}

export function useAudioPlayback({ sampleRate = 24000 }: UseAudioPlaybackOptions = {}) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(1);
  const audioContextRef = useRef<AudioContext | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const queueRef = useRef<AudioBuffer[]>([]);
  const nextStartTimeRef = useRef(0);
  const isSchedulingRef = useRef(false);

  // Resume AudioContext on first user gesture (click/keydown/touch).
  // Without this, AudioContext created before a gesture stays suspended.
  useEffect(() => {
    const resume = () => {
      const ctx = audioContextRef.current;
      if (ctx && ctx.state === "suspended") {
        ctx.resume();
      }
    };
    const events = ["click", "keydown", "touchstart"] as const;
    events.forEach((e) => document.addEventListener(e, resume, { once: false, passive: true }));
    return () => {
      events.forEach((e) => document.removeEventListener(e, resume));
    };
  }, []);

  const getAudioContext = useCallback(() => {
    if (!audioContextRef.current || audioContextRef.current.state === "closed") {
      const ctx = new AudioContext({ sampleRate });
      const gain = ctx.createGain();
      gain.gain.value = volume;
      gain.connect(ctx.destination);
      audioContextRef.current = ctx;
      gainNodeRef.current = gain;
    }
    // Attempt resume — will actually succeed once user interacts
    if (audioContextRef.current.state === "suspended") {
      audioContextRef.current.resume();
    }
    return { ctx: audioContextRef.current, gain: gainNodeRef.current! };
  }, [sampleRate, volume]);

  const schedulePlayback = useCallback(() => {
    if (isSchedulingRef.current) return;
    isSchedulingRef.current = true;

    const { ctx, gain } = getAudioContext();

    while (queueRef.current.length > 0) {
      const buffer = queueRef.current.shift()!;
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(gain);

      const startTime = Math.max(ctx.currentTime, nextStartTimeRef.current);
      source.start(startTime);
      nextStartTimeRef.current = startTime + buffer.duration;
    }

    isSchedulingRef.current = false;
  }, [getAudioContext]);

  /**
   * Feed PCM audio data for playback.
   * Expects Int16 PCM at the configured sample rate.
   */
  const playAudioData = useCallback(
    (data: ArrayBuffer) => {
      const { ctx } = getAudioContext();

      // Convert Int16 PCM to Float32
      const int16 = new Int16Array(data);
      const float32 = new Float32Array(int16.length);
      for (let i = 0; i < int16.length; i++) {
        float32[i] = int16[i] / (int16[i] < 0 ? 0x8000 : 0x7fff);
      }

      // Create AudioBuffer
      const audioBuffer = ctx.createBuffer(1, float32.length, sampleRate);
      audioBuffer.copyToChannel(float32, 0);

      queueRef.current.push(audioBuffer);
      setIsPlaying(true);
      // Use queueMicrotask to ensure scheduling runs after current scheduling completes
      queueMicrotask(() => schedulePlayback());
    },
    [getAudioContext, sampleRate, schedulePlayback]
  );

  const updateVolume = useCallback(
    (newVolume: number) => {
      setVolume(newVolume);
      if (gainNodeRef.current) {
        gainNodeRef.current.gain.value = newVolume;
      }
    },
    []
  );

  /**
   * Flush the audio queue — stop all pending playback immediately.
   * Used when the agent is interrupted (barge-in).
   * Disconnects the gain node to silence all connected sources instantly,
   * then creates a fresh gain node. Keeps AudioContext alive to avoid
   * expensive teardown/rebuild latency.
   */
  const flushQueue = useCallback(() => {
    queueRef.current = [];

    const ctx = audioContextRef.current;
    if (ctx && ctx.state !== "closed") {
      // Disconnect old gain node — instantly silences all connected sources
      if (gainNodeRef.current) {
        gainNodeRef.current.disconnect();
      }
      // Create fresh gain node
      const gain = ctx.createGain();
      gain.gain.value = volume;
      gain.connect(ctx.destination);
      gainNodeRef.current = gain;
      // Reset scheduling time to "now" so next audio plays immediately
      nextStartTimeRef.current = ctx.currentTime;
    } else {
      nextStartTimeRef.current = 0;
    }
    setIsPlaying(false);
  }, [volume]);

  const stopPlayback = useCallback(() => {
    flushQueue();
  }, [flushQueue]);

  return {
    isPlaying,
    volume,
    playAudioData,
    updateVolume,
    stopPlayback,
    flushQueue,
  };
}

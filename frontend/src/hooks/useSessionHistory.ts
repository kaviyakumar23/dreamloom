/**
 * Fetch and manage previous story sessions from the REST API.
 */
import { useCallback, useEffect, useState } from "react";

const API_BASE = import.meta.env.VITE_API_URL || `${window.location.origin}`;

export interface SessionSummary {
  session_id: string;
  title: string;
  genre: string;
  style: string;
  scene_count: number;
  thumbnail: string;
  created_at: number;
  updated_at: number;
}

export function useSessionHistory(userId: string) {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const res = await fetch(
        `${API_BASE}/api/sessions?user_id=${encodeURIComponent(userId)}`
      );
      if (res.ok) {
        const data = await res.json();
        setSessions(data.sessions || []);
      }
    } catch (err) {
      console.warn("Failed to fetch sessions:", err);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  const deleteSession = useCallback(
    async (sessionId: string) => {
      try {
        await fetch(
          `${API_BASE}/api/sessions/${sessionId}?user_id=${encodeURIComponent(userId)}`,
          { method: "DELETE" }
        );
        setSessions((prev) => prev.filter((s) => s.session_id !== sessionId));
      } catch (err) {
        console.warn("Failed to delete session:", err);
      }
    },
    [userId]
  );

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { sessions, loading, refresh, deleteSession };
}

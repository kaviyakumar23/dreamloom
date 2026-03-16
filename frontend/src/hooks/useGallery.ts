/**
 * Fetch and manage published stories in the public gallery.
 */
import { useCallback, useEffect, useState } from "react";

const API_BASE = import.meta.env.VITE_API_URL || `${window.location.origin}`;

export interface PublishedStorySummary {
  publish_id: string;
  title: string;
  genre: string;
  logline: string;
  cover_url: string;
  scene_count: number;
  published_at: number;
}

export interface PublishedStoryFull extends PublishedStorySummary {
  style: string;
  trailer_text: string;
  scenes: Array<{ type: string; content?: string; url?: string }[]>;
  scene_images: Array<{ url: string; narration: string; title: string }>;
}

export interface MyPublishedEntry {
  publish_id: string;
  session_id: string;
}

export function useGallery() {
  const [stories, setStories] = useState<PublishedStorySummary[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchGallery = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/gallery`);
      if (res.ok) {
        const data = await res.json();
        setStories(data.stories || []);
      }
    } catch (err) {
      console.warn("Failed to fetch gallery:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchStory = useCallback(async (publishId: string): Promise<PublishedStoryFull | null> => {
    try {
      const res = await fetch(`${API_BASE}/api/gallery/${publishId}`);
      if (res.ok) {
        const data = await res.json();
        return data.story || null;
      }
    } catch (err) {
      console.warn("Failed to fetch published story:", err);
    }
    return null;
  }, []);

  const publishStory = useCallback(async (body: Record<string, unknown>): Promise<string | null> => {
    try {
      const res = await fetch(`${API_BASE}/api/gallery/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const data = await res.json();
        return data.publish_id || null;
      }
    } catch (err) {
      console.warn("Failed to publish story:", err);
    }
    return null;
  }, []);

  const unpublishStory = useCallback(async (publishId: string, userId: string): Promise<boolean> => {
    try {
      const res = await fetch(
        `${API_BASE}/api/gallery/${publishId}?user_id=${encodeURIComponent(userId)}`,
        { method: "DELETE" }
      );
      return res.ok;
    } catch (err) {
      console.warn("Failed to unpublish story:", err);
      return false;
    }
  }, []);

  const fetchMyPublished = useCallback(async (userId: string): Promise<MyPublishedEntry[]> => {
    try {
      const res = await fetch(
        `${API_BASE}/api/gallery/mine?user_id=${encodeURIComponent(userId)}`
      );
      if (res.ok) {
        const data = await res.json();
        return data.published || [];
      }
    } catch (err) {
      console.warn("Failed to fetch my published:", err);
    }
    return [];
  }, []);

  useEffect(() => {
    fetchGallery();
  }, [fetchGallery]);

  return { stories, loading, fetchGallery, fetchStory, publishStory, unpublishStory, fetchMyPublished };
}

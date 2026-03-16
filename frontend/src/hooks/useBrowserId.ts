/**
 * Persistent anonymous browser identity for session ownership.
 * Stores a UUID in localStorage under `dreamloom_user_id`.
 */
import { useMemo } from "react";

const STORAGE_KEY = "dreamloom_user_id";

export function useBrowserId(): string {
  return useMemo(() => {
    let id = localStorage.getItem(STORAGE_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(STORAGE_KEY, id);
    }
    return id;
  }, []);
}

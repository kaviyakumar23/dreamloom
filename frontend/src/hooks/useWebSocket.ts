/**
 * WebSocket connection management hook.
 * Handles bidi communication with the DreamLoom backend.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  Collaborator,
  ConnectionStatus,
  DirectorsCutData,
  GenerationStatus,
  SaveStatus,
  ServerMessage,
  StoryBibleData,
  StoryPage,
  StoryState,
} from "../types";

const WS_URL = import.meta.env.VITE_WS_URL || `ws://${window.location.host}/ws`;
export const ACTIVE_SESSION_KEY = "dreamloom_active_session";

const INITIAL_STORY_STATE: StoryState = {
  sessionId: "",
  title: "",
  genre: "",
  style: "",
  pages: [],
  currentText: "",
};

const INITIAL_GENERATION_STATUS: GenerationStatus = {
  active: false,
  message: "",
};

const INITIAL_BIBLE: StoryBibleData = {
  title: "",
  genre: "",
  style: "",
  worldDescription: "",
  characters: {},
  scenes: [],
  kidSafeMode: true,
};

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>("disconnected");
  const [story, setStory] = useState<StoryState>(INITIAL_STORY_STATE);
  const [agentSpeaking, setAgentSpeaking] = useState(false);
  const [generationStatus, setGenerationStatus] = useState<GenerationStatus>(INITIAL_GENERATION_STATUS);
  const [storyBible, setStoryBible] = useState<StoryBibleData>(INITIAL_BIBLE);
  const [directorsCut, setDirectorsCut] = useState<DirectorsCutData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [lastDeleted, setLastDeleted] = useState<{ page: StoryPage; timer: ReturnType<typeof setTimeout> } | null>(null);
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [isHost, setIsHost] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [transcripts, setTranscripts] = useState<Array<{source: "user"|"agent"; text: string; timestamp: number}>>([]);

  const triggerSaveIndicator = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    setSaveStatus("saving");
    saveTimerRef.current = setTimeout(() => {
      setSaveStatus("saved");
      saveTimerRef.current = setTimeout(() => {
        setSaveStatus("idle");
        saveTimerRef.current = null;
      }, 3000);
    }, 1500);
  }, []);

  // Callbacks for audio binary data and flush
  const onAudioDataRef = useRef<((data: ArrayBuffer) => void) | null>(null);
  const onAudioFlushRef = useRef<(() => void) | null>(null);

  // Pending template prompt — sent on first turn_complete (Fix 16)
  const pendingTemplateRef = useRef<string | null>(null);

  // Reconnect refs
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectCountRef = useRef(0);
  const manualDisconnectRef = useRef(false);
  const connectRef = useRef<((params?: { userId?: string; resumeSessionId?: string; displayName?: string }) => void) | null>(null);
  // Store last connect params so auto-reconnect can resume the same session
  const lastConnectParamsRef = useRef<{ userId?: string; resumeSessionId?: string; displayName?: string } | null>(null);
  const currentSessionIdRef = useRef<string>("");

  const connect = useCallback((params?: { userId?: string; resumeSessionId?: string; joinSessionId?: string; displayName?: string }) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;
    manualDisconnectRef.current = false;
    reconnectCountRef.current = 0;

    // Store connect params for auto-reconnect (exclude joinSessionId — only used once)
    if (params) {
      lastConnectParamsRef.current = {
        userId: params.userId,
        resumeSessionId: params.resumeSessionId,
        displayName: params.displayName,
      };
    }

    setStatus("connecting");
    let url = WS_URL;
    const qp = new URLSearchParams();
    if (params?.userId) qp.set("user_id", params.userId);
    if (params?.resumeSessionId) qp.set("resume_session_id", params.resumeSessionId);
    if (params?.joinSessionId) qp.set("join_session_id", params.joinSessionId);
    if (params?.displayName) qp.set("display_name", params.displayName);
    const qs = qp.toString();
    if (qs) url += (url.includes("?") ? "&" : "?") + qs;

    const ws = new WebSocket(url);
    ws.binaryType = "arraybuffer";
    wsRef.current = ws;

    ws.onopen = () => {
      setStatus("connected");
      reconnectCountRef.current = 0;
    };

    ws.onclose = () => {
      wsRef.current = null;
      if (manualDisconnectRef.current) {
        setStatus("disconnected");
        return;
      }
      // Auto-reconnect with exponential backoff, preserving session
      if (reconnectCountRef.current < 5) {
        const delay = Math.min(1000 * Math.pow(2, reconnectCountRef.current), 10000);
        reconnectCountRef.current++;
        setStatus("reconnecting");
        reconnectTimerRef.current = setTimeout(() => {
          // Reconnect with stored params + current session ID so we resume, not restart
          const prev = lastConnectParamsRef.current;
          const sessionId = currentSessionIdRef.current;
          connectRef.current?.({
            userId: prev?.userId,
            resumeSessionId: sessionId || prev?.resumeSessionId,
            displayName: prev?.displayName,
          });
        }, delay);
      } else {
        setStatus("disconnected");
      }
    };

    ws.onerror = () => {
      setStatus("error");
    };

    ws.onmessage = (event) => {
      // Binary = audio PCM from agent
      if (event.data instanceof ArrayBuffer) {
        onAudioDataRef.current?.(event.data);
        return;
      }

      // JSON messages
      try {
        const msg: ServerMessage = JSON.parse(event.data);
        handleServerMessage(msg);
      } catch {
        console.warn("Failed to parse server message:", event.data);
      }
    };
  }, []);

  // Keep connectRef in sync so onclose can call it
  connectRef.current = connect;

  const disconnect = useCallback(() => {
    manualDisconnectRef.current = true;
    currentSessionIdRef.current = "";
    lastConnectParamsRef.current = null;
    sessionStorage.removeItem(ACTIVE_SESSION_KEY);
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    wsRef.current?.close();
    wsRef.current = null;
    setStatus("disconnected");
    setStory(INITIAL_STORY_STATE);
    setGenerationStatus(INITIAL_GENERATION_STATUS);
    setStoryBible(INITIAL_BIBLE);
    setDirectorsCut(null);
    setCollaborators([]);
    setIsHost(true);
  }, []);

  const handleServerMessage = useCallback((msg: ServerMessage) => {
    switch (msg.type) {
      case "session_start": {
        const sid = msg.session_id as string;
        currentSessionIdRef.current = sid;
        sessionStorage.setItem(ACTIVE_SESSION_KEY, sid);
        setStory((prev) => ({
          ...prev,
          sessionId: sid,
          currentText: msg.message as string,
        }));
        const role = (msg.role as string) || "host";
        setIsHost(role === "host");
        if (msg.collaborators) {
          setCollaborators(msg.collaborators as Collaborator[]);
        }
        // Fallback: if pending template hasn't been sent by turn_complete
        // after 5s, send it anyway (native audio models may delay turn_complete)
        if (pendingTemplateRef.current) {
          setTimeout(() => {
            if (pendingTemplateRef.current && wsRef.current?.readyState === WebSocket.OPEN) {
              const tp = pendingTemplateRef.current;
              pendingTemplateRef.current = null;
              wsRef.current.send(JSON.stringify({ type: "text", text: tp }));
            }
          }, 5000);
        }
        break;
      }

      case "session_restored": {
        currentSessionIdRef.current = msg.session_id as string;
        sessionStorage.setItem(ACTIVE_SESSION_KEY, msg.session_id as string);
        const restoredRole = (msg.role as string) || "host";
        setIsHost(restoredRole === "host");
        if (msg.collaborators) {
          setCollaborators(msg.collaborators as Collaborator[]);
        }
        const restoredStory = msg.story as {
          title: string;
          genre: string;
          style: string;
          pages: Array<{
            sceneId: string;
            sceneNumber: number;
            title: string;
            narration: string;
            blocks: StoryPage["blocks"];
            imageUrl?: string;
            musicUrl?: string;
            musicMood?: string;
          }>;
        };
        setStory({
          sessionId: msg.session_id as string,
          title: restoredStory.title || "",
          genre: restoredStory.genre || "",
          style: restoredStory.style || "",
          pages: (restoredStory.pages || []).map((p) => ({
            sceneId: p.sceneId,
            sceneNumber: p.sceneNumber,
            title: p.title,
            narration: p.narration,
            blocks: p.blocks,
            imageUrl: p.imageUrl,
            musicUrl: p.musicUrl,
            musicMood: p.musicMood,
          })),
          currentText: (msg.message as string) || "",
        });
        const bible = msg.storyBible as Record<string, unknown> | undefined;
        if (bible) {
          setStoryBible({
            title: (bible.title as string) || "",
            genre: (bible.genre as string) || "",
            style: (bible.style as string) || "",
            worldDescription: (bible.world_description as string) || "",
            characters: (bible.characters as Record<string, string>) || {},
            scenes: (bible.scenes as StoryBibleData["scenes"]) || [],
            kidSafeMode: bible.kid_safe_mode as boolean,
          });
        }
        // Restore Director's Cut if it was previously generated
        const dc = msg.directorsCut as Record<string, unknown> | undefined;
        if (dc) {
          setDirectorsCut({
            coverUrl: (dc.cover_url as string) || "",
            logline: (dc.logline as string) || "",
            trailerText: (dc.trailer_text as string) || "",
            sceneImages: (dc.scene_images as DirectorsCutData["sceneImages"]) || [],
            metadata: dc.metadata as StoryPage["metadata"],
          });
        }
        break;
      }

      case "text":
        setAgentSpeaking(true);
        setIsProcessing(false);
        setStory((prev) => ({
          ...prev,
          currentText: prev.currentText + (msg.text as string),
        }));
        break;

      case "turn_complete":
        setAgentSpeaking(false);
        setIsProcessing(false);
        setStory((prev) => ({
          ...prev,
          currentText: "",
        }));
        // Send pending template after agent's first turn completes (Fix 16)
        if (pendingTemplateRef.current) {
          const templatePrompt = pendingTemplateRef.current;
          pendingTemplateRef.current = null;
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ type: "text", text: templatePrompt }));
          }
        }
        break;


      case "interrupted":
        setAgentSpeaking(false);
        setIsProcessing(false);
        // Flush audio queue so old speech stops immediately
        onAudioFlushRef.current?.();
        break;

      case "transcription": {
        const isFinal = msg.final as boolean;
        if (isFinal && (msg.text as string).trim()) {
          setTranscripts(prev => [...prev.slice(-49), {
            source: msg.source as "user" | "agent",
            text: msg.text as string,
            timestamp: Date.now(),
          }]);
        }
        break;
      }

      case "generating":
        setGenerationStatus({
          active: msg.active as boolean,
          message: (msg.message as string) || "",
        });
        break;

      case "interleaved_scene": {
        const blocks = ((msg.blocks as Array<{ type: string; content?: string; url?: string }>) || []) as StoryPage["blocks"];
        const metadata = msg.metadata as StoryPage["metadata"];

        // Build narration from text blocks
        const narration = blocks
          .filter((b) => b.type === "text" && b.content)
          .map((b) => b.content)
          .join("\n\n");

        // Get first image for backward compat
        const firstImage = blocks.find((b) => b.type === "image" && b.url);

        const page: StoryPage = {
          sceneId: msg.scene_id as string,
          sceneNumber: msg.scene_number as number,
          title: (msg.title as string) || "",
          narration,
          blocks,
          imageUrl: firstImage?.url,
          metadata,
          parentSceneId: msg.parent_scene_id as string | undefined,
          branchLabel: msg.branch_label as string | undefined,
          branchSiblings: msg.branch_siblings as string[] | undefined,
        };
        setStory((prev) => {
          // Deduplicate — scene may already exist from session_restored
          if (prev.pages.some((p) => p.sceneId === page.sceneId)) {
            return { ...prev, currentText: "" };
          }
          return { ...prev, pages: [...prev.pages, page], currentText: "" };
        });
        setGenerationStatus(INITIAL_GENERATION_STATUS);
        triggerSaveIndicator();
        break;
      }

      // Legacy scene format (backward compat)
      case "scene": {
        const page: StoryPage = {
          sceneId: msg.scene_id as string,
          sceneNumber: msg.scene_number as number,
          title: "",
          narration: msg.narration as string,
          blocks: [{ type: "text", content: msg.narration as string }],
        };
        setStory((prev) => {
          if (prev.pages.some((p) => p.sceneId === page.sceneId)) {
            return { ...prev, currentText: "" };
          }
          return { ...prev, pages: [...prev.pages, page], currentText: "" };
        });
        break;
      }

      case "image":
        setStory((prev) => {
          const sceneId = msg.scene_id as string;
          const url = msg.url as string;
          const pages = [...prev.pages];
          const idx = sceneId
            ? pages.findIndex((p) => p.sceneId === sceneId)
            : pages.length - 1;
          if (idx >= 0) {
            pages[idx] = { ...pages[idx], imageUrl: url };
          }
          return { ...prev, pages };
        });
        break;

      case "music":
        setStory((prev) => {
          const pages = [...prev.pages];
          if (pages.length > 0) {
            pages[pages.length - 1] = {
              ...pages[pages.length - 1],
              musicUrl: msg.url as string,
              musicMood: msg.mood as string,
            };
          }
          return { ...prev, pages };
        });
        break;

      case "story_metadata":
        setStory((prev) => ({
          ...prev,
          title: (msg.title as string) || prev.title,
          genre: (msg.genre as string) || prev.genre,
          style: (msg.style as string) || prev.style,
        }));
        triggerSaveIndicator();
        break;

      case "story_state_update":
        setStoryBible({
          title: (msg.title as string) || "",
          genre: (msg.genre as string) || "",
          style: (msg.style as string) || "",
          worldDescription: (msg.world_description as string) || "",
          characters: (msg.characters as Record<string, string>) || {},
          scenes: (msg.scenes as StoryBibleData["scenes"]) || [],
          kidSafeMode: msg.kid_safe_mode as boolean,
        });
        break;

      case "scene_updated": {
        const updatedBlocks = ((msg.blocks as Array<{ type: string; content?: string; url?: string }>) || []) as StoryPage["blocks"];
        const updatedNarration = updatedBlocks
          .filter((b) => b.type === "text" && b.content)
          .map((b) => b.content)
          .join("\n\n");
        const updatedFirstImage = updatedBlocks.find((b) => b.type === "image" && b.url);

        setStory((prev) => {
          const pages = prev.pages.map((p) =>
            p.sceneId === (msg.scene_id as string)
              ? {
                  ...p,
                  title: (msg.title as string) || p.title,
                  narration: updatedNarration || p.narration,
                  blocks: updatedBlocks.length > 0 ? updatedBlocks : p.blocks,
                  imageUrl: updatedFirstImage?.url || p.imageUrl,
                  metadata: (msg.metadata as StoryPage["metadata"]) || p.metadata,
                }
              : p
          );
          return { ...prev, pages };
        });
        triggerSaveIndicator();
        break;
      }

      case "scene_deleted": {
        const deletedNumber = msg.scene_number as number;
        const deletedSceneId = msg.scene_id as string | undefined;
        // Capture the page before removing for undo
        setStory((prev) => {
          const deletedPage = prev.pages.find((p) =>
            deletedSceneId ? p.sceneId === deletedSceneId : p.sceneNumber === deletedNumber
          );
          if (deletedPage) {
            // Clear any previous undo timer
            if (lastDeleted?.timer) clearTimeout(lastDeleted.timer);
            const timer = setTimeout(() => setLastDeleted(null), 6000);
            setLastDeleted({ page: { ...deletedPage }, timer });
          }
          const pages = prev.pages
            .filter((p) => deletedSceneId ? p.sceneId !== deletedSceneId : p.sceneNumber !== deletedNumber)
            .map((p, i) => ({ ...p, sceneNumber: i + 1 }));
          return { ...prev, pages };
        });
        triggerSaveIndicator();
        break;
      }

      case "scene_restored": {
        // Re-insert a restored scene (from undo delete)
        const restoredBlocks = ((msg.blocks as Array<{ type: string; content?: string; url?: string }>) || []) as StoryPage["blocks"];
        const restoredNarration = restoredBlocks
          .filter((b) => b.type === "text" && b.content)
          .map((b) => b.content)
          .join("\n\n");
        const restoredFirstImage = restoredBlocks.find((b) => b.type === "image" && b.url);

        const restoredPage: StoryPage = {
          sceneId: msg.scene_id as string,
          sceneNumber: msg.scene_number as number,
          title: (msg.title as string) || "",
          narration: restoredNarration || (msg.narration as string) || "",
          blocks: restoredBlocks,
          imageUrl: restoredFirstImage?.url || (msg.image_url as string) || undefined,
          musicUrl: (msg.music_url as string) || undefined,
          musicMood: (msg.mood as string) || undefined,
          metadata: msg.metadata as StoryPage["metadata"],
        };
        setStory((prev) => {
          const pages = [...prev.pages, restoredPage]
            .sort((a, b) => a.sceneNumber - b.sceneNumber);
          return { ...prev, pages };
        });
        setLastDeleted(null);
        triggerSaveIndicator();
        break;
      }

      case "directors_cut":
        setDirectorsCut({
          coverUrl: (msg.cover_url as string) || "",
          logline: (msg.logline as string) || "",
          trailerText: (msg.trailer_text as string) || "",
          sceneImages: (msg.scene_images as DirectorsCutData["sceneImages"]) || [],
          metadata: msg.metadata as StoryPage["metadata"],
        });
        break;

      case "directors_cut_invalidated":
        console.log("[WS] Director's Cut invalidated — scenes changed, hiding DC card");
        setDirectorsCut(null);
        break;

      case "reconnecting": {
        // Server-side Live API reconnection — keep ALL story state intact.
        // This is NOT an error — it's a transient voice connection recovery.
        setAgentSpeaking(false);
        onAudioFlushRef.current?.();
        const reconnectMsg = (msg.message as string) || "Voice reconnecting...";
        const isResolved = reconnectMsg.toLowerCase().includes("reconnected");
        if (isResolved) {
          // Voice is back — clear any reconnecting message after a short delay
          setTimeout(() => setError(null), 2000);
        } else {
          // Show as a softer status, not a hard error
          setError(reconnectMsg);
        }
        break;
      }

      case "collaborator_joined":
        if (msg.collaborators) {
          setCollaborators(msg.collaborators as Collaborator[]);
        }
        break;

      case "collaborator_left":
        if (msg.collaborators) {
          setCollaborators(msg.collaborators as Collaborator[]);
        }
        break;

      case "error":
        console.error("Server error:", msg.message);
        setGenerationStatus(INITIAL_GENERATION_STATUS);
        setError(msg.message as string);
        break;
    }
  }, []);

  // Send text message
  const sendText = useCallback((text: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "text", text }));
      setIsProcessing(true);
    }
  }, []);

  // Send audio PCM bytes
  const sendAudio = useCallback((data: ArrayBuffer) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(data);
    }
  }, []);

  // Send camera frame
  const sendCameraFrame = useCallback((base64Data: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({ type: "camera_frame", data: base64Data })
      );
    }
  }, []);

  // Send regenerate scene request
  const sendRegenerate = useCallback((sceneNumber: number) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({ type: "regenerate_scene", scene_number: sceneNumber })
      );
    }
  }, []);

  // Send delete scene request
  const sendDelete = useCallback((sceneNumber: number) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({ type: "delete_scene", scene_number: sceneNumber })
      );
    }
  }, []);

  // Undo delete — re-insert the page optimistically and notify backend
  const sendUndoDelete = useCallback(() => {
    if (!lastDeleted) return;
    const { page, timer } = lastDeleted;
    clearTimeout(timer);
    // Optimistically re-insert
    setStory((prev) => {
      const pages = [...prev.pages, page]
        .sort((a, b) => a.sceneNumber - b.sceneNumber)
        .map((p, i) => ({ ...p, sceneNumber: i + 1 }));
      return { ...prev, pages };
    });
    setLastDeleted(null);
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({ type: "undo_delete", scene_id: page.sceneId })
      );
    }
  }, [lastDeleted]);

  // Edit narration inline
  const sendEditNarration = useCallback((sceneId: string, blockIndex: number, content: string) => {
    // Optimistic update
    setStory((prev) => {
      const pages = prev.pages.map((p) => {
        if (p.sceneId !== sceneId) return p;
        const blocks = [...p.blocks];
        if (blocks[blockIndex]?.type === "text") {
          blocks[blockIndex] = { ...blocks[blockIndex], content };
        }
        const narration = blocks
          .filter((b) => b.type === "text" && b.content)
          .map((b) => b.content)
          .join("\n\n");
        return { ...p, blocks, narration };
      });
      return { ...prev, pages };
    });
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({ type: "update_narration", scene_id: sceneId, block_index: blockIndex, content })
      );
    }
  }, []);

  // Reorder scenes
  const sendReorder = useCallback((sceneIds: string[]) => {
    setStory((prev) => {
      const pageMap = new Map(prev.pages.map((p) => [p.sceneId, p]));
      const pages = sceneIds
        .map((id) => pageMap.get(id))
        .filter((p): p is StoryPage => !!p)
        .map((p, i) => ({ ...p, sceneNumber: i + 1 }));
      return { ...prev, pages };
    });
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({ type: "reorder_scenes", scene_ids: sceneIds })
      );
    }
  }, []);

  // Branch scene ("What If?")
  const sendBranch = useCallback((sceneId: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({ type: "branch_scene", scene_id: sceneId })
      );
    }
  }, []);

  // Manual turn control (push-to-talk)
  const sendActivityStart = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "activity_start" }));
    }
  }, []);
  const sendActivityEnd = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "activity_end" }));
    }
  }, []);

  // Toggle kid-safe mode
  const toggleKidSafe = useCallback((enabled: boolean) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({ type: "toggle_kid_safe", enabled })
      );
    }
    setStoryBible((prev) => ({ ...prev, kidSafeMode: enabled }));
  }, []);

  // Register audio data callback
  const setOnAudioData = useCallback(
    (cb: ((data: ArrayBuffer) => void) | null) => {
      onAudioDataRef.current = cb;
    },
    []
  );

  // Register audio flush callback (called on interruption)
  const setOnAudioFlush = useCallback(
    (cb: (() => void) | null) => {
      onAudioFlushRef.current = cb;
    },
    []
  );

  // Set a pending template prompt to send on first turn_complete
  const setPendingTemplate = useCallback((prompt: string) => {
    pendingTemplateRef.current = prompt;
  }, []);

  // Auto-clear error after 8 seconds
  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => setError(null), 8000);
    return () => clearTimeout(timer);
  }, [error]);

  const dismissError = useCallback(() => setError(null), []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      wsRef.current?.close();
    };
  }, []);

  return {
    status,
    story,
    agentSpeaking,
    generationStatus,
    isProcessing,
    transcripts,
    storyBible,
    directorsCut,
    error,
    dismissError,
    saveStatus,
    lastDeleted,
    collaborators,
    isHost,
    connect,
    disconnect,
    sendText,
    sendAudio,
    sendCameraFrame,
    sendRegenerate,
    sendDelete,
    sendUndoDelete,
    sendEditNarration,
    sendReorder,
    sendBranch,
    sendActivityStart,
    sendActivityEnd,
    toggleKidSafe,
    setOnAudioData,
    setOnAudioFlush,
    setPendingTemplate,
  };
}

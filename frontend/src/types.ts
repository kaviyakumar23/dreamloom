/** Shared type definitions for DreamLoom frontend. */

/** A single block in an interleaved scene (text or image). */
export interface InterleavedBlock {
  type: "text" | "image";
  content?: string; // for text blocks
  url?: string; // for image blocks
}

/** Metadata from scene generation for the debug panel. */
export interface SceneMetadata {
  model: string;
  modalities: string[];
  part_order: string[];
  generation_ms: number;
  error?: string;
}

/** WebSocket message types sent FROM the server. */
export type ServerMessageType =
  | "session_start"
  | "session_restored"
  | "text"
  | "turn_complete"
  | "interrupted"
  | "interleaved_scene"
  | "generating"
  | "image"
  | "music"
  | "scene"
  | "story_metadata"
  | "story_state_update"
  | "directors_cut"
  | "scene_updated"
  | "scene_deleted"
  | "scene_restored"
  | "reconnecting"
  | "transcription"
  | "collaborator_joined"
  | "collaborator_left"
  | "directors_cut_invalidated"
  | "error";

export interface ServerMessage {
  type: ServerMessageType;
  [key: string]: unknown;
}

export interface SessionStartMessage extends ServerMessage {
  type: "session_start";
  session_id: string;
  message: string;
}

export interface TextMessage extends ServerMessage {
  type: "text";
  text: string;
  turn_complete: boolean;
}

export interface TurnCompleteMessage extends ServerMessage {
  type: "turn_complete";
}

export interface InterruptedMessage extends ServerMessage {
  type: "interrupted";
}

export interface InterleavedSceneMessage extends ServerMessage {
  type: "interleaved_scene";
  scene_id: string;
  scene_number: number;
  title: string;
  blocks: InterleavedBlock[];
  metadata: SceneMetadata;
}

export interface GeneratingMessage extends ServerMessage {
  type: "generating";
  active: boolean;
  message: string;
}

export interface ImageMessage extends ServerMessage {
  type: "image";
  url: string;
  scene_id: string;
}

export interface MusicMessage extends ServerMessage {
  type: "music";
  url: string;
  mood: string;
  tempo: string;
}

export interface SceneMessage extends ServerMessage {
  type: "scene";
  scene_id: string;
  scene_number: number;
  narration: string;
}

export interface StoryMetadataMessage extends ServerMessage {
  type: "story_metadata";
  title: string;
  genre: string;
  style: string;
}

export interface StoryStateUpdateMessage extends ServerMessage {
  type: "story_state_update";
  title: string;
  genre: string;
  style: string;
  world_description: string;
  characters: Record<string, string>;
  scenes: Array<{
    scene_number: number;
    title: string;
    narration: string;
    mood: string;
    thumbnail?: string;
  }>;
  kid_safe_mode: boolean;
}

export interface DirectorsCutMessage extends ServerMessage {
  type: "directors_cut";
  cover_url: string;
  logline: string;
  trailer_text: string;
  scene_images: Array<{ url: string; narration: string; title: string }>;
  metadata: SceneMetadata;
}

export interface ErrorMessage extends ServerMessage {
  type: "error";
  message: string;
}

/** Client → Server message types. */
export interface ClientTextMessage {
  type: "text";
  text: string;
}

export interface ClientCameraFrame {
  type: "camera_frame";
  data: string; // base64 JPEG
}

export interface ClientEndTurn {
  type: "end_turn";
}

export interface ClientToggleKidSafe {
  type: "toggle_kid_safe";
  enabled: boolean;
}

/** Story state maintained in the frontend. */
export interface StoryPage {
  sceneId: string;
  sceneNumber: number;
  title: string;
  narration: string;
  blocks: InterleavedBlock[];
  imageUrl?: string;
  musicUrl?: string;
  musicMood?: string;
  metadata?: SceneMetadata;
  parentSceneId?: string;
  branchLabel?: string;
  branchSiblings?: string[];
}

export interface StoryBibleData {
  title: string;
  genre: string;
  style: string;
  worldDescription: string;
  characters: Record<string, string>;
  scenes: Array<{
    sceneNumber: number;
    title: string;
    narration: string;
    mood: string;
    thumbnail?: string;
  }>;
  kidSafeMode: boolean;
}

export interface DirectorsCutData {
  coverUrl: string;
  logline: string;
  trailerText: string;
  sceneImages: Array<{ url: string; narration: string; title: string }>;
  metadata?: SceneMetadata;
}

export interface StoryState {
  sessionId: string;
  title: string;
  genre: string;
  style: string;
  pages: StoryPage[];
  currentText: string; // Streaming text buffer
}

/** Connection status. */
export type ConnectionStatus = "disconnected" | "connecting" | "connected" | "reconnecting" | "error";

/** Auto-save indicator status. */
export type SaveStatus = "idle" | "saving" | "saved" | "error";

/** A connected collaborator. */
export interface Collaborator {
  userId: string;
  displayName: string;
  role: "host" | "viewer";
  color: string;
}

/** Generation status for status bar. */
export interface GenerationStatus {
  active: boolean;
  message: string;
}

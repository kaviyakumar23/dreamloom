/**
 * DreamLoom — Main App component.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useWebSocket, ACTIVE_SESSION_KEY } from "./hooks/useWebSocket";
import { useBrowserId } from "./hooks/useBrowserId";
import { useSessionHistory } from "./hooks/useSessionHistory";
import { useAudioCapture } from "./hooks/useAudioCapture";
import { useAudioPlayback } from "./hooks/useAudioPlayback";
import { useCameraCapture } from "./hooks/useCameraCapture";
import { AudioControls } from "./components/AudioControls";
import { LandingPage } from "./components/LandingPage";
import { StatusBar } from "./components/StatusBar";
import { StoryCanvas } from "./components/StoryCanvas";
import { StoryBible } from "./components/StoryBible";
import { DebugPanel } from "./components/DebugPanel";
import { DirectorsCut } from "./components/DirectorsCut";
import { CameraPreview } from "./components/CameraPreview";
import { ShortcutsOverlay } from "./components/ShortcutsOverlay";
import { Toast } from "./components/Toast";
import { ConversationPanel } from "./components/ConversationPanel";

function App() {
  const {
    status,
    story,
    agentSpeaking,
    generationStatus,
    isProcessing,
    storyBible,
    directorsCut,
    error,
    dismissError,
    saveStatus,
    lastDeleted,
    voiceStyle,
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
    sendVoiceStyle,
    collaborators,
    isHost,
    toggleKidSafe,
    setOnAudioData,
    setOnAudioFlush,
    setPendingTemplate,
  } = useWebSocket();

  const userId = useBrowserId();
  const { sessions: previousSessions, loading: sessionsLoading, refresh: refreshSessions, deleteSession } = useSessionHistory(userId);

  const { playAudioData, volume, updateVolume, flushQueue } = useAudioPlayback();

  // Wire up audio playback to WebSocket incoming audio
  setOnAudioData(playAudioData);
  // Wire up flush for barge-in interruption
  setOnAudioFlush(flushQueue);

  // Flush audio when connection drops or errors occur
  useEffect(() => {
    if (status !== "connected") {
      flushQueue();
    }
  }, [status, flushQueue]);

  // Always send audio — even while agent speaks — so Live API can detect barge-in.
  // Browser echoCancellation filters out speaker feedback.
  const handleSendAudio = useCallback(
    (data: ArrayBuffer) => {
      if (status === "connected") {
        sendAudio(data);
      }
    },
    [sendAudio, status]
  );

  const { isCapturing: isMicOn, toggleCapture: toggleMic } = useAudioCapture({
    onAudioData: handleSendAudio,
  });

  const handleCameraFrame = useCallback(
    (base64: string) => sendCameraFrame(base64),
    [sendCameraFrame]
  );

  const { isCapturing: isCameraOn, stream: cameraStream, toggleCapture: toggleCamera } =
    useCameraCapture({
      onFrame: handleCameraFrame,
    });

  const handleStart = useCallback(() => {
    connect({ userId });
  }, [connect, userId]);

  const handleResume = useCallback((sessionId: string) => {
    connect({ userId, resumeSessionId: sessionId });
  }, [connect, userId]);

  // Template auto-send on connect — uses turn_complete timing (Fix 16)
  const handleStartWithTemplate = useCallback((prompt: string) => {
    setPendingTemplate(prompt);
    connect({ userId });
  }, [connect, userId, setPendingTemplate]);

  // Auto-resume active session on page reload
  const autoResumedRef = useRef(false);
  useEffect(() => {
    if (autoResumedRef.current) return;
    const activeSessionId = sessionStorage.getItem(ACTIVE_SESSION_KEY);
    if (activeSessionId && status === "disconnected") {
      autoResumedRef.current = true;
      connect({ userId, resumeSessionId: activeSessionId });
    }
  }, [connect, userId, status]);

  // Bible drawer state
  const [bibleOpen, setBibleOpen] = useState(false);

  // Debug panel state
  const [debugOpen, setDebugOpen] = useState(false);

  // Shortcuts overlay state
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  // Get latest scene metadata for debug panel
  const latestMetadata = story.pages.length > 0
    ? story.pages[story.pages.length - 1].metadata
    : undefined;

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      const editable = (e.target as HTMLElement)?.isContentEditable;
      if (tag === "INPUT" || tag === "TEXTAREA" || editable) return;

      switch (e.key) {
        case " ":
        case "m":
        case "M":
          e.preventDefault();
          if (status === "connected") toggleMic();
          break;
        case "c":
        case "C":
          if (status === "connected") toggleCamera();
          break;
        case "d":
        case "D":
          setDebugOpen((o) => !o);
          break;
        case "b":
        case "B":
          setBibleOpen((o) => !o);
          break;
        case "?":
          setShortcutsOpen((o) => !o);
          break;
        case "Escape":
          setBibleOpen(false);
          setDebugOpen(false);
          setShortcutsOpen(false);
          break;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [status, toggleMic, toggleCamera]);

  const isSessionActive = status === "connected" && story.sessionId;

  // Refresh session list when returning to landing page
  useEffect(() => {
    if (!isSessionActive) {
      refreshSessions();
    }
  }, [isSessionActive, refreshSessions]);

  return (
    <div className="flex h-full flex-col bg-dreamloom-bg">
      <AnimatePresence mode="wait">
        {!isSessionActive ? (
          <LandingPage
            key="landing"
            onStart={handleStart}
            isConnecting={status === "connecting"}
            previousSessions={previousSessions}
            sessionsLoading={sessionsLoading}
            onResume={handleResume}
            onDeleteSession={deleteSession}
            onStartWithTemplate={handleStartWithTemplate}
          />
        ) : (
          <div key="session" className="flex h-full flex-col">
            <StatusBar
              connectionStatus={status}
              sessionId={story.sessionId}
              kidSafeMode={storyBible.kidSafeMode}
              saveStatus={saveStatus}
              voiceStyle={voiceStyle}
              collaborators={collaborators}
              onConnect={connect}
              onDisconnect={disconnect}
              onToggleBible={() => setBibleOpen((o) => !o)}
              onToggleKidSafe={() => toggleKidSafe(!storyBible.kidSafeMode)}
              onVoiceStyleChange={sendVoiceStyle}
            />

            {/* Error / reconnecting toast banner */}
            <AnimatePresence>
              {error && (
                <motion.div
                  className={`mx-4 mt-2 flex items-center gap-3 rounded-xl border px-5 py-3 backdrop-blur-sm ${
                    error.toLowerCase().includes("reconnect")
                      ? "border-dreamloom-gold/30 bg-dreamloom-gold/10"
                      : "border-red-400/30 bg-red-500/10"
                  }`}
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                >
                  {error.toLowerCase().includes("reconnect") ? (
                    <motion.div
                      className="h-4 w-4 flex-shrink-0 rounded-full border-2 border-dreamloom-gold/30 border-t-dreamloom-gold"
                      animate={{ rotate: 360 }}
                      transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}
                    />
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 text-red-400">
                      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                      <line x1="12" y1="9" x2="12" y2="13" />
                      <line x1="12" y1="17" x2="12.01" y2="17" />
                    </svg>
                  )}
                  <span className={`flex-1 font-body text-sm ${
                    error.toLowerCase().includes("reconnect")
                      ? "text-dreamloom-gold"
                      : "text-red-300"
                  }`}>{error}</span>
                  <button onClick={dismissError} aria-label="Dismiss error" className={
                    error.toLowerCase().includes("reconnect")
                      ? "text-dreamloom-gold/60 hover:text-dreamloom-gold"
                      : "text-red-400 hover:text-red-300"
                  }>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            <StoryCanvas
              story={story}
              agentSpeaking={agentSpeaking}
              generationStatus={generationStatus}
              isMicOn={isMicOn}
              onRegenerate={sendRegenerate}
              onDelete={sendDelete}
              onEditNarration={sendEditNarration}
              onReorder={sendReorder}
              onBranch={sendBranch}
            />

            {/* Floating conversation panel for agent speech */}
            <ConversationPanel
              text={story.currentText}
              agentSpeaking={agentSpeaking}
            />

            {/* Director's Cut overlay */}
            {directorsCut && (
              <DirectorsCut
                data={directorsCut}
                pages={story.pages}
                userId={userId}
                sessionId={story.sessionId}
                storyTitle={story.title}
                storyGenre={story.genre}
                storyStyle={story.style}
                onClose={() => {/* keep visible */}}
              />
            )}

            {/* Camera preview PiP */}
            <CameraPreview stream={cameraStream} />

            <AudioControls
              connectionStatus={status}
              isMicOn={isMicOn}
              isCameraOn={isCameraOn}
              volume={volume}
              agentSpeaking={agentSpeaking}
              generationStatus={generationStatus}
              isProcessing={isProcessing}
              isHost={isHost}
              onToggleMic={toggleMic}
              onToggleCamera={toggleCamera}
              onVolumeChange={updateVolume}
              onSendText={sendText}
            />

            {/* Story Bible drawer */}
            <StoryBible
              data={storyBible}
              isOpen={bibleOpen}
              onClose={() => setBibleOpen(false)}
            />

            {/* Undo delete toast */}
            <AnimatePresence>
              {lastDeleted && (
                <Toast
                  message={`Scene "${lastDeleted.page.title || lastDeleted.page.sceneNumber}" deleted`}
                  action={{ label: "Undo", onClick: sendUndoDelete }}
                  onDismiss={() => {}}
                />
              )}
            </AnimatePresence>

            {/* Keyboard shortcuts overlay */}
            <AnimatePresence>
              {shortcutsOpen && (
                <ShortcutsOverlay onClose={() => setShortcutsOpen(false)} />
              )}
            </AnimatePresence>

            {/* Debug panel */}
            <DebugPanel
              metadata={latestMetadata}
              isOpen={debugOpen}
              onToggle={() => setDebugOpen((o) => !o)}
            />
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default App;

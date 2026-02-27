import { useCallback, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { Card, Shape } from "../types/canvas";
import { CardState, CardAction } from "./useCardReducer";
import { useShapeStore } from "./useShapeStore";

const LOCAL_GAME_STATE_STORAGE_KEY_PREFIX = "maginet:local-game-state:v1";
const LOCAL_GAME_STATE_SESSION_KEY = "maginet:local-session-id:v1";
const LOCAL_GAME_STATE_SESSION_CHANNEL = "maginet:local-session:v1";
const LOCAL_GAME_STATE_SESSION_PROBE_MS = 140;
const LOCAL_GAME_STATE_VERSION = 1;
const LOCAL_GAME_STATE_TTL_MS = 1000 * 60 * 60 * 12;

export type PersistedLocalGameState = {
  version: number;
  savedAt: number;
  deckParam: string;
  cardState: CardState;
  shapes: Shape[];
  connectedPeerIds: string[];
};

type LocalStateSessionMessage = {
  type: "hello" | "in-use";
  sessionId: string;
  instanceId: string;
};

const createLocalSessionId = () => {
  if (typeof window !== "undefined" && typeof window.crypto?.randomUUID === "function") {
    return window.crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

const getOrCreateLocalSessionId = () => {
  if (typeof window === "undefined") return null;
  try {
    let sessionId = window.sessionStorage.getItem(LOCAL_GAME_STATE_SESSION_KEY);
    if (!sessionId) {
      sessionId = createLocalSessionId();
      window.sessionStorage.setItem(LOCAL_GAME_STATE_SESSION_KEY, sessionId);
    }
    return sessionId;
  } catch {
    return null;
  }
};

const getSessionScopedStateStorageKey = (sessionId: string | null) =>
  sessionId
    ? `${LOCAL_GAME_STATE_STORAGE_KEY_PREFIX}:${sessionId}`
    : LOCAL_GAME_STATE_STORAGE_KEY_PREFIX;

const dedupeShapesById = (shapeList: Shape[]) => {
  const byId = new Map<string, Shape>();
  shapeList.forEach((shape) => {
    if (!shape || typeof shape !== "object" || typeof shape.id !== "string") return;
    byId.set(shape.id, shape);
  });
  return Array.from(byId.values());
};

const parsePersistedLocalGameState = (
  raw: string
): PersistedLocalGameState | null => {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const value = parsed as Record<string, unknown>;

    if (value.version !== LOCAL_GAME_STATE_VERSION) return null;
    if (typeof value.savedAt !== "number" || !Number.isFinite(value.savedAt)) {
      return null;
    }
    if (typeof value.deckParam !== "string") return null;

    const cardStateValue = value.cardState as Record<string, unknown> | undefined;
    if (!cardStateValue) return null;
    if (!Array.isArray(cardStateValue.cards) || !Array.isArray(cardStateValue.deck)) {
      return null;
    }
    if (!Array.isArray(value.shapes)) return null;

    return {
      version: LOCAL_GAME_STATE_VERSION,
      savedAt: value.savedAt,
      deckParam: value.deckParam,
      cardState: {
        cards: cardStateValue.cards as Card[],
        deck: cardStateValue.deck as Card[],
        lastAction:
          typeof cardStateValue.lastAction === "string"
            ? cardStateValue.lastAction
            : undefined,
        actionId:
          typeof cardStateValue.actionId === "number"
            ? cardStateValue.actionId
            : undefined,
      },
      shapes: dedupeShapesById(value.shapes as Shape[]),
      connectedPeerIds: Array.isArray(value.connectedPeerIds)
        ? value.connectedPeerIds.filter((id): id is string => typeof id === "string")
        : [],
    };
  } catch {
    return null;
  }
};

const normalizeDeckParam = (value: string) =>
  value.trim().replace(/\r\n/g, "\n");

interface UseGamePersistenceOptions {
  normalizedDeckParam: string;
  cardState: CardState;
  dispatch: React.Dispatch<CardAction>;
  shapes: Shape[];
  connections: Map<string, unknown>;
  connectToPeer: (peerId: string) => void;
  peerId?: string;
}

export function useGamePersistence({
  normalizedDeckParam,
  cardState,
  dispatch,
  shapes,
  connections,
  connectToPeer,
  peerId,
}: UseGamePersistenceOptions) {
  const [sessionHydrationStatus, setSessionHydrationStatus] = useState<
    "pending" | "restored" | "none"
  >("pending");
  const [localStateStorageKey, setLocalStateStorageKey] = useState<string | null>(null);
  const [isLocalStateKeyReady, setIsLocalStateKeyReady] = useState(false);
  const [isSetupComplete, setIsSetupComplete] = useState(false);

  const localSessionInstanceIdRef = useRef(createLocalSessionId());
  const reconnectPeerIdsRef = useRef<string[]>([]);
  const attemptedReconnectRef = useRef(false);

  // Build a session-scoped persistence key and resolve duplicated-tab collisions.
  useEffect(() => {
    if (typeof window === "undefined") {
      setLocalStateStorageKey(getSessionScopedStateStorageKey(null));
      setIsLocalStateKeyReady(true);
      return;
    }

    let isCancelled = false;
    let probeTimeoutId: number | null = null;
    let channel: BroadcastChannel | null = null;
    const instanceId = localSessionInstanceIdRef.current;
    let activeSessionId = getOrCreateLocalSessionId();
    let conflictDetected = false;

    const applyStorageKey = (sessionId: string | null) => {
      if (isCancelled) return;
      setLocalStateStorageKey(getSessionScopedStateStorageKey(sessionId));
      setIsLocalStateKeyReady(true);
    };

    const rotateSessionId = () => {
      const nextSessionId = createLocalSessionId();
      try {
        window.sessionStorage.setItem(LOCAL_GAME_STATE_SESSION_KEY, nextSessionId);
      } catch {
        // If sessionStorage is unavailable we keep the shared fallback key.
        return null;
      }
      return nextSessionId;
    };

    if (!activeSessionId || typeof BroadcastChannel === "undefined") {
      applyStorageKey(activeSessionId);
      return;
    }

    channel = new BroadcastChannel(LOCAL_GAME_STATE_SESSION_CHANNEL);
    channel.onmessage = (event: MessageEvent<LocalStateSessionMessage>) => {
      const message = event.data;
      if (!message || typeof message !== "object") return;
      if (message.sessionId !== activeSessionId) return;
      if (message.instanceId === instanceId) return;

      if (message.type === "hello") {
        channel?.postMessage({
          type: "in-use",
          sessionId: activeSessionId,
          instanceId,
        } satisfies LocalStateSessionMessage);
        return;
      }

      if (message.type === "in-use") {
        conflictDetected = true;
      }
    };

    channel.postMessage({
      type: "hello",
      sessionId: activeSessionId,
      instanceId,
    } satisfies LocalStateSessionMessage);

    probeTimeoutId = window.setTimeout(() => {
      if (isCancelled) return;
      if (conflictDetected) {
        activeSessionId = rotateSessionId();
      }
      applyStorageKey(activeSessionId);
    }, LOCAL_GAME_STATE_SESSION_PROBE_MS);

    return () => {
      isCancelled = true;
      if (probeTimeoutId !== null) {
        window.clearTimeout(probeTimeoutId);
      }
      channel?.close();
    };
  }, []);

  // Restore local state after refresh (deck/hand + board shapes)
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!isLocalStateKeyReady || !localStateStorageKey) return;

    reconnectPeerIdsRef.current = [];
    attemptedReconnectRef.current = false;
    setSessionHydrationStatus("pending");

    if (!normalizedDeckParam) {
      setSessionHydrationStatus("none");
      return;
    }

    const raw = window.localStorage.getItem(localStateStorageKey);
    if (!raw) {
      setSessionHydrationStatus("none");
      return;
    }

    const snapshot = parsePersistedLocalGameState(raw);
    if (!snapshot) {
      setSessionHydrationStatus("none");
      return;
    }

    const isDeckMatch =
      normalizeDeckParam(snapshot.deckParam) === normalizedDeckParam;
    const isFresh = Date.now() - snapshot.savedAt <= LOCAL_GAME_STATE_TTL_MS;
    if (!isDeckMatch || !isFresh) {
      setSessionHydrationStatus("none");
      return;
    }

    dispatch({ type: "SET_STATE", payload: snapshot.cardState });
    useShapeStore.setState({
      shapes: snapshot.shapes,
      selectedShapeIds: [],
      shapeInCreation: null,
      editingText: null,
      history: { past: [], future: [] },
      canUndo: false,
      canRedo: false,
      isDraggingShape: false,
      isResizingShape: false,
      isRotatingShape: false,
    });
    reconnectPeerIdsRef.current = snapshot.connectedPeerIds;
    setSessionHydrationStatus("restored");
    setIsSetupComplete(true);
    toast("Recovered your previous local table state", {
      id: "local-state-recovered",
    });
  }, [dispatch, isLocalStateKeyReady, localStateStorageKey, normalizedDeckParam]);

  // Reconnect to previous peers after a refresh, when possible.
  useEffect(() => {
    if (sessionHydrationStatus !== "restored") return;
    if (!peerId || attemptedReconnectRef.current) return;

    const reconnectIds = Array.from(new Set(reconnectPeerIdsRef.current)).filter(
      (id) => id && id !== peerId && !connections.has(id)
    );
    attemptedReconnectRef.current = true;
    reconnectIds.forEach((id) => connectToPeer(id));
    if (reconnectIds.length > 0) {
      toast(
        `Trying to reconnect to ${reconnectIds.length} peer${reconnectIds.length === 1 ? "" : "s"}`,
        { id: "local-state-reconnect" }
      );
    }
  }, [connectToPeer, connections, peerId, sessionHydrationStatus]);

  const persistLocalGameState = useCallback(() => {
    if (typeof window === "undefined") return;
    if (!isLocalStateKeyReady || !localStateStorageKey) return;
    if (sessionHydrationStatus === "pending" || !normalizedDeckParam) return;

    const snapshot: PersistedLocalGameState = {
      version: LOCAL_GAME_STATE_VERSION,
      savedAt: Date.now(),
      deckParam: normalizedDeckParam,
      cardState: {
        cards: cardState.cards,
        deck: cardState.deck,
        lastAction: cardState.lastAction,
        actionId: cardState.actionId,
      },
      shapes: dedupeShapesById(shapes),
      connectedPeerIds: Array.from(new Set(connections.keys())),
    };

    try {
      window.localStorage.setItem(localStateStorageKey, JSON.stringify(snapshot));
    } catch {
      // Ignore persistence failures (private mode, quota, etc.).
    }
  }, [
    cardState,
    connections,
    isLocalStateKeyReady,
    localStateStorageKey,
    normalizedDeckParam,
    sessionHydrationStatus,
    shapes,
  ]);

  // Persist local state continuously so refresh/disconnect can recover it.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const timeoutId = window.setTimeout(persistLocalGameState, 180);
    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [persistLocalGameState]);

  // Flush the latest local state snapshot when the page is hidden/unloaded.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const flushSnapshot = () => {
      persistLocalGameState();
    };
    window.addEventListener("pagehide", flushSnapshot);
    window.addEventListener("beforeunload", flushSnapshot);
    return () => {
      window.removeEventListener("pagehide", flushSnapshot);
      window.removeEventListener("beforeunload", flushSnapshot);
    };
  }, [persistLocalGameState]);

  return {
    sessionHydrationStatus,
    setSessionHydrationStatus,
    isSetupComplete,
    setIsSetupComplete,
    localStateStorageKey,
    persistLocalGameState,
  };
}

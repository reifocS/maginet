import * as React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import toast from "react-hot-toast";
import { Handler, useGesture } from "@use-gesture/react";

import { Shape as ShapeComponent } from "./Shape";
import { DOMVector, screenToCanvas } from "../utils/vec";
import Hand from "./Hand";
import ContextMenu from "./ContextMenu";
import CounterControls from "./components/CounterControls";
import SetupScreen from "./components/SetupScreen";
import HelpPanel from "./components/HelpPanel";
import ShortcutDock from "./components/ShortcutDock";
import useCards, {
  Datum,
  mapDataToCards,
  processRawText,
} from "../hooks/useCards";
import { generateId } from "../utils/math";
import { useCardReducer, type CardState } from "../hooks/useCardReducer";
import { panCamera, screenToWorld } from "../utils/canvas_utils";
import { SelectionPanel } from "./SelectionPanel";
import inputs, { normalizeWheel } from "./inputs";
import { useShapeStore } from "../hooks/useShapeStore";
import { useCamera } from "../hooks/useCamera";
import { usePeerSync } from "../hooks/usePeerSync";
import { useKeyboardShortcuts } from "../hooks/useKeyboardShortcuts";
import { useTouchGestures } from "../hooks/useTouchGestures";
import { useHandDrag } from "../hooks/useHandDrag";
import EditingTextShape from "./EditingTextShape";

import {
  Point,
  Card,
  Shape,
  ShapeType,
  Mode,
  intersect,
} from "../types/canvas";

import {
  HEARTBEAT_STALE_MS,
  CARD_PREVIEW_SIZE,
  CARD_BACK_URL,
} from "./constants/game";

const SHORTCUT_DOCK_OPEN_STORAGE_KEY = "maginet:shortcut-dock-open";
const OBJECT_SNAP_THRESHOLD_PX = 10;
const LOCAL_GAME_STATE_STORAGE_KEY_PREFIX = "maginet:local-game-state:v1";
const LOCAL_GAME_STATE_SESSION_KEY = "maginet:local-session-id:v1";
const LOCAL_GAME_STATE_SESSION_CHANNEL = "maginet:local-session:v1";
const LOCAL_GAME_STATE_SESSION_PROBE_MS = 140;
const LOCAL_GAME_STATE_VERSION = 1;
const LOCAL_GAME_STATE_TTL_MS = 1000 * 60 * 60 * 12;

type SmartGuideState = {
  vertical: number | null;
  horizontal: number | null;
};

type SnapContext = {
  movingShape: Shape;
  excludeIds?: string[];
  movingShapes?: Shape[];
  dragDelta?: [number, number];
};

type PersistedLocalGameState = {
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

const normalizeDeckParam = (value: string) =>
  value.trim().replace(/\r\n/g, "\n");

const createLocalSessionId = () => {
  if (typeof window !== "undefined" && typeof window.crypto?.randomUUID === "function") {
    return window.crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

const dedupeShapesById = (shapeList: Shape[]) => {
  const byId = new Map<string, Shape>();
  shapeList.forEach((shape) => {
    if (!shape || typeof shape !== "object" || typeof shape.id !== "string") return;
    byId.set(shape.id, shape);
  });
  return Array.from(byId.values());
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

const getInitialShortcutDockOpen = () => {
  if (typeof window === "undefined") return true;
  try {
    const value = window.localStorage.getItem(SHORTCUT_DOCK_OPEN_STORAGE_KEY);
    if (value === null) return true;
    return value === "true";
  } catch {
    return true;
  }
};

function Canvas() {
  // Shape store state and actions
  const {
    shapes,
    selectedShapeIds,
    shapeInCreation,
    editingText,
    isDraggingShape,
    setShapes,
    setSelectedShapeIds,
    setShapeInCreation,
    setEditingText,
    createShape,
    updateShapeInCreation,
    undo,
    redo,
    flipSelectedShapes,
    engageSelected,
    tapShape,
    untapAll,
    copySelected,
    updateCountersOnSelected,
    clearCountersOnSelected,
    changeColorOnSelected,
    sendSelectedToBack,
    sendSelectedToFront,
    increaseSrcIndexOnSelected,
    removeSelectedImages,
    getSelectedImages,
  } = useShapeStore();


  // Camera
  const {
    camera,
    setCamera,
    cameraRef,
    applyCameraImmediate,
    applyZoomDelta,
    applyZoomStep,
  } = useCamera();

  // Local state
  const [isDragging, setIsDragging] = useState(false);
  const [dragVector, setDragVector] = useState<DOMVector | null>(null);
  const [mode, setMode] = useState<Mode>("select");
  const [shapeType, setShapeType] = useState<ShapeType>("text");
  const [hoveredCard, setHoveredCard] = useState<string | null>(null);
  const [isCommandPressed, setIsCommandPressed] = useState(false);
  const [isSpacePressed, setIsSpacePressed] = useState(false);
  const [, setMousePosition] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [lastPanPosition, setLastPanPosition] = useState<Point | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [isShortcutDockOpen, setIsShortcutDockOpen] = useState(
    getInitialShortcutDockOpen
  );
  const [isSnapEnabled, setIsSnapEnabled] = useState(false);
  const [viewportSize, setViewportSize] = useState(() => ({
    width: typeof window === "undefined" ? 0 : window.innerWidth,
    height: typeof window === "undefined" ? 0 : window.innerHeight,
  }));
  const [isMobile, setIsMobile] = useState(() =>
    typeof window === "undefined"
      ? false
      : window.matchMedia("(max-width: 720px)").matches
  );
  const [showCounterControls, setShowCounterControls] = useState(false);
  const [smartGuides, setSmartGuides] = useState<SmartGuideState>({
    vertical: null,
    horizontal: null,
  });
  const [sessionHydrationStatus, setSessionHydrationStatus] = useState<
    "pending" | "restored" | "none"
  >("pending");
  const [localStateStorageKey, setLocalStateStorageKey] = useState<string | null>(null);
  const [isLocalStateKeyReady, setIsLocalStateKeyReady] = useState(false);

  // Refs
  const ref = useRef<SVGSVGElement>(null);
  const rDragging = useRef<{ shape: Shape; origin: number[] } | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const drawCardRef = useRef<() => void>(() => {});
  const engageCardRef = useRef<() => void>(() => {});
  const applyZoomStepRef = useRef(applyZoomStep);
  const localSessionInstanceIdRef = useRef(createLocalSessionId());
  const reconnectPeerIdsRef = useRef<string[]>([]);
  const attemptedReconnectRef = useRef(false);
  applyZoomStepRef.current = applyZoomStep;

  // Touch gestures
  const {
    isTouchGestureActive,
    getTouchPan,
    setTouchPan,
    markTouchPanMoved,
    getTouchPlace,
    setTouchPlace,
    markTouchPlaceMoved,
    onPointerDownCapture: onPointerDownCaptureCanvas,
    onPointerMoveCapture: onPointerMoveCaptureCanvas,
    onPointerUpCapture: onPointerUpCaptureCanvas,
  } = useTouchGestures({
    svgRef: ref,
    cameraRef,
    applyCameraImmediate,
    setIsPanning,
    setLastPanPosition,
    setDragVector: () => setDragVector(null),
    setIsDragging,
    clearDragging: () => { rDragging.current = null; },
  });

  // URL parameters
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const deckParam = params.get("deck") ?? "";
  const normalizedDeckParam = normalizeDeckParam(deckParam);

  const [isSetupComplete, setIsSetupComplete] = useState(false);

  const deckNames = deckParam.trim()
    ? processRawText(deckParam.trim())
    : [];

  // Selection rectangle
  const selectionRect =
    dragVector && isDragging ? dragVector.toDOMRect() : null;

  // Card data
  const {
    data,
    isLoading: isDeckLoading,
    error: deckError,
  } = useCards(deckNames);

  // Related cards data
  const allParts =
    data
      ?.filter((v) => v.all_parts && v.all_parts.length > 0)
      .flatMap((v) => v.all_parts) ?? [];

  const relatedCardNames = deckNames.length
    ? Array.from(
      new Set(
        allParts.map((v) => {
          if (v.name.includes("//")) {
            //Double faced card
            return v.name.split("//")[0].trim();
          }
          return v.name;
        })
      )
    ).concat(["copy", "Amoeboid Changeling"])
    : [];

  const { data: relatedCards } = useCards(relatedCardNames);

  // Card state
  const [cardState, dispatch] = useCardReducer({
    cards: [],
    deck: [],
  });
  const { cards, deck } = cardState;

  // Peer sync
  const {
    peer,
    error,
    connections,
    connectToPeer,
    receivedDataMap,
    peerPresence,
    peerNames,
    rollCoin,
    rollDie,
    pickStarter,
  } = usePeerSync({ cards, deck, cardState });

  const handleWheelRef = useRef<Handler<"wheel">>(() => { });
  const gestureHandlersRef = useRef({
    onWheel: (state: Parameters<Handler<"wheel">>[0]) =>
      handleWheelRef.current(state),
  });
  const gestureConfigRef = useRef({
    target: document.body,
    eventOptions: { passive: false },
  });

  handleWheelRef.current = (state) => {
    if (!isSetupComplete) return;
    const { event, delta, ctrlKey } = state;
    const target = event.target as HTMLElement | null;
    if (target?.closest(".selection-panel, .help-dialog, .Modal__modal")) {
      return;
    }
    event.preventDefault();
    // Ctrl+scroll or pinch = zoom, regular scroll = pan
    if (ctrlKey || event.metaKey) {
      const { point } = inputs.wheel(event);
      const z = normalizeWheel(event)[2];
      applyZoomDelta([point[0], point[1]], z);
    } else {
      // Regular scroll pans (good for trackpad)
      // Smooth pan with reduced sensitivity
      applyCameraImmediate(
        panCamera(cameraRef.current, delta[0] * 0.8, delta[1] * 0.8)
      );
    }
  };

  // Gesture handling
  useGesture(gestureHandlersRef.current, gestureConfigRef.current);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleResize = () => {
      setViewportSize({ width: window.innerWidth, height: window.innerHeight });
    };
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia("(max-width: 720px)");
    const handleChange = (event: MediaQueryListEvent) => {
      setIsMobile(event.matches);
    };
    media.addEventListener("change", handleChange);
    return () => media.removeEventListener("change", handleChange);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(
        SHORTCUT_DOCK_OPEN_STORAGE_KEY,
        String(isShortcutDockOpen)
      );
    } catch {
      // Ignore persistence failures (private mode, quota, etc.).
    }
  }, [isShortcutDockOpen]);

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
    if (!peer?.id || attemptedReconnectRef.current) return;

    const reconnectIds = Array.from(new Set(reconnectPeerIdsRef.current)).filter(
      (id) => id && id !== peer.id && !connections.has(id)
    );
    attemptedReconnectRef.current = true;
    reconnectIds.forEach((peerId) => connectToPeer(peerId));
    if (reconnectIds.length > 0) {
      toast(
        `Trying to reconnect to ${reconnectIds.length} peer${reconnectIds.length === 1 ? "" : "s"}`,
        { id: "local-state-reconnect" }
      );
    }
  }, [connectToPeer, connections, peer?.id, sessionHydrationStatus]);

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

  const clearSmartGuides = useCallback(() => {
    setSmartGuides((prev) => {
      if (prev.vertical === null && prev.horizontal === null) {
        return prev;
      }
      return { vertical: null, horizontal: null };
    });
  }, []);

  const getShapeBounds = useCallback((shape: Shape, pointOverride?: [number, number]) => {
    const [xRaw, yRaw] = pointOverride ?? (shape.point as [number, number]);
    const [wRaw, hRaw] = shape.size as [number, number];
    const left = wRaw >= 0 ? xRaw : xRaw + wRaw;
    const top = hRaw >= 0 ? yRaw : yRaw + hRaw;
    const width = Math.abs(wRaw);
    const height = Math.abs(hRaw);
    const right = left + width;
    const bottom = top + height;
    return {
      left,
      right,
      top,
      bottom,
      centerX: left + width / 2,
      centerY: top + height / 2,
    };
  }, []);

  const snapPointToGrid = useCallback(
    (
      point: [number, number],
      context?: SnapContext
    ) => {
      if (!isSnapEnabled || !context) {
        if (context && !isSnapEnabled) clearSmartGuides();
        return point;
      }

      const movingBounds =
        context.movingShapes &&
        context.movingShapes.length > 1 &&
        context.dragDelta
          ? (() => {
            const [dx, dy] = context.dragDelta;
            let left = Number.POSITIVE_INFINITY;
            let top = Number.POSITIVE_INFINITY;
            let right = Number.NEGATIVE_INFINITY;
            let bottom = Number.NEGATIVE_INFINITY;

            for (const movingShape of context.movingShapes) {
              const bounds = getShapeBounds(movingShape, [
                movingShape.point[0] + dx,
                movingShape.point[1] + dy,
              ]);
              left = Math.min(left, bounds.left);
              top = Math.min(top, bounds.top);
              right = Math.max(right, bounds.right);
              bottom = Math.max(bottom, bounds.bottom);
            }

            return {
              left,
              top,
              right,
              bottom,
              centerX: (left + right) / 2,
              centerY: (top + bottom) / 2,
            };
          })()
          : getShapeBounds(context.movingShape, point);
      const movingAnchorsX = [movingBounds.left, movingBounds.centerX, movingBounds.right];
      const movingAnchorsY = [movingBounds.top, movingBounds.centerY, movingBounds.bottom];
      const snapThreshold = OBJECT_SNAP_THRESHOLD_PX / Math.max(camera.z, 0.001);

      let snapDeltaX = 0;
      let snapDeltaY = 0;
      let guideX: number | null = null;
      let guideY: number | null = null;
      let bestXDistance = Number.POSITIVE_INFINITY;
      let bestYDistance = Number.POSITIVE_INFINITY;

      const trySnapX = (source: number, target: number) => {
        const delta = target - source;
        const distance = Math.abs(delta);
        if (distance > snapThreshold) return;
        if (distance < bestXDistance) {
          bestXDistance = distance;
          snapDeltaX = delta;
          guideX = target;
        }
      };

      const trySnapY = (source: number, target: number) => {
        const delta = target - source;
        const distance = Math.abs(delta);
        if (distance > snapThreshold) return;
        if (distance < bestYDistance) {
          bestYDistance = distance;
          snapDeltaY = delta;
          guideY = target;
        }
      };

      const excludedIds = new Set(context.excludeIds ?? []);
      excludedIds.add(context.movingShape.id);

      for (const candidate of shapes) {
        if (excludedIds.has(candidate.id)) continue;
        const bounds = getShapeBounds(candidate);
        const candidateAnchorsX = [bounds.left, bounds.centerX, bounds.right];
        const candidateAnchorsY = [bounds.top, bounds.centerY, bounds.bottom];
        for (const source of movingAnchorsX) {
          for (const target of candidateAnchorsX) {
            trySnapX(source, target);
          }
        }
        for (const source of movingAnchorsY) {
          for (const target of candidateAnchorsY) {
            trySnapY(source, target);
          }
        }
      }

      if (viewportSize.width > 0 && viewportSize.height > 0) {
        const viewportCenter = screenToWorld(
          [viewportSize.width / 2, viewportSize.height / 2],
          camera
        );
        trySnapX(movingBounds.centerX, viewportCenter[0]);
        trySnapY(movingBounds.centerY, viewportCenter[1]);
      }

      const snappedX = guideX !== null ? point[0] + snapDeltaX : point[0];
      const snappedY = guideY !== null ? point[1] + snapDeltaY : point[1];

      setSmartGuides((prev) => {
        const nextVertical = guideX;
        const nextHorizontal = guideY;
        if (prev.vertical === nextVertical && prev.horizontal === nextHorizontal) {
          return prev;
        }
        return { vertical: nextVertical, horizontal: nextHorizontal };
      });

      return [snappedX, snappedY] as [number, number];
    },
    [camera, clearSmartGuides, getShapeBounds, isSnapEnabled, shapes, viewportSize]
  );

  // Hand drag
  const {
    handDrag,
    dragPreview,
    draggingHandCardId,
    selectedHandCardId,
    setSelectedHandCardId,
    handleHandDragStart,
    playCardAt,
    playHandCardFromMenu,
  } = useHandDrag({
    svgRef: ref,
    cameraRef,
    snapPointToGrid,
    dispatch,
    setShapes,
    cards,
  });

  const moveHandCardToDeck = (cardId: string, position: "top" | "bottom") => {
    dispatch({ type: "MOVE_HAND_TO_DECK", payload: { cardId, position } });
  };

  // Card actions
  const drawCard = () => {
    dispatch({ type: "DRAW_CARD" });
  };

  const mulligan = () => {
    dispatch({ type: "MULLIGAN" });
  };

  const addToken = () => {
    const center = screenToCanvas(
      { x: window.innerWidth / 2, y: window.innerHeight / 2 },
      camera
    );
    const [snappedX, snappedY] = snapPointToGrid([center.x, center.y]);
    setShapes((prev) => [
      ...prev,
      {
        id: generateId(),
        type: "token",
        point: [snappedX, snappedY],
        size: [55, 55],
        srcIndex: 0,
        fontSize: 12,
        text: "+1/+1",
      },
    ]);
  };

  const sendBackToHand = () => {
    const selectedCards: Card[] = getSelectedImages();
    dispatch({ type: "SEND_TO_HAND", payload: selectedCards });
    removeSelectedImages();
  };

  const sendBackToDeck = (position: "top" | "bottom") => {
    const selectedCards: Card[] = getSelectedImages();
    dispatch({
      type: "SEND_TO_DECK",
      payload: { cards: selectedCards, position },
    });
    removeSelectedImages();
  };

  const onShuffleDeck = () => {
    dispatch({ type: "SHUFFLE_DECK" });
  };

  const addCardToHand = (card: Datum) => {
    dispatch({ type: "ADD_TO_HAND", payload: card });
  };

  const startNewGame = () => {
    if (!data) {
      toast.error("Deck is still loading. Try again in a moment.");
      return;
    }

    const shouldReset = window.confirm(
      "Start a new game? This will clear your battlefield and hand for this tab."
    );
    if (!shouldReset) return;

    const nextDeck = mapDataToCards(data);
    dispatch({ type: "INITIALIZE_DECK", payload: nextDeck });
    useShapeStore.setState({
      shapes: [],
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
    setDragVector(null);
    setIsDragging(false);
    setMode("select");
    setShapeType("text");
    setShowCounterControls(false);
    setSelectedHandCardId(null);
    clearSmartGuides();
    reconnectPeerIdsRef.current = Array.from(connections.keys());
    attemptedReconnectRef.current = true;
    setSessionHydrationStatus("none");

    try {
      if (localStateStorageKey) {
        window.localStorage.removeItem(localStateStorageKey);
      }
    } catch {
      // Ignore persistence failures (private mode, quota, etc.).
    }

    toast(`Started a new game with ${nextDeck.length} cards`, {
      id: "new-game-started",
    });
  };

  drawCardRef.current = drawCard;
  engageCardRef.current = engageSelected;

  function onPointerDownCanvas(e: React.PointerEvent<SVGElement>) {
    if (handDrag) {
      e.preventDefault();
      return;
    }
    const { x, y } = screenToCanvas({ x: e.clientX, y: e.clientY }, camera);
    const point = [x, y] as [number, number];
    const snappedPoint = snapPointToGrid(point);

    if (e.pointerType === "touch") {
      if (isTouchGestureActive()) {
        return;
      }
      if (selectedHandCardId) {
        setTouchPlace({
          pointerId: e.pointerId,
          origin: { x: e.clientX, y: e.clientY },
          hasMoved: false,
        });
        e.currentTarget.setPointerCapture(e.pointerId);
        return;
      }
      if (mode === "select" && !shapeInCreation) {
        setIsPanning(true);
        setLastPanPosition({ x: e.clientX, y: e.clientY });
        setTouchPan({
          pointerId: e.pointerId,
          origin: { x: e.clientX, y: e.clientY },
          hasMoved: false,
        });
        e.currentTarget.setPointerCapture(e.pointerId);
        return;
      }
    }

    // Handle panning with middle mouse button, Space+drag, or Alt+drag
    if (e.button === 1 || (e.button === 0 && (isSpacePressed || e.altKey))) {
      setIsPanning(true);
      setLastPanPosition({ x: e.clientX, y: e.clientY });
      e.currentTarget.setPointerCapture(e.pointerId);
      return;
    }

    // Handle shape creation
    if (mode === "create") {
      e.currentTarget.setPointerCapture(e.pointerId);
      if (shapeType === "text") {
        const id = generateId();
        setShapes((prevShapes) => [
          ...prevShapes,
          {
            id,
            point: snappedPoint,
            size: [0, 0],
            type: "text",
            text: "",
            srcIndex: 0,
          },
        ]);
        setEditingText({ id, text: "" });
        setTimeout(() => {
          inputRef.current?.focus();
          // highlight all text
          inputRef.current?.setSelectionRange(0, inputRef.current.value.length);
        }, 0);
      } else {
        createShape(shapeType, snappedPoint);
      }
      return;
    }
    // Handle selection
    else if (mode === "select" && !rDragging.current) {
      e.currentTarget.setPointerCapture(e.pointerId);
      setDragVector(new DOMVector(x, y, 0, 0));
    }
  }

  function onPointerMoveCanvas(e: React.PointerEvent<SVGElement>) {
    const { x, y } = screenToCanvas({ x: e.clientX, y: e.clientY }, camera);

    const touchPlace = getTouchPlace();
    if (touchPlace?.pointerId === e.pointerId && !touchPlace.hasMoved) {
      const totalMove = Math.hypot(
        e.clientX - touchPlace.origin.x,
        e.clientY - touchPlace.origin.y
      );
      if (totalMove > 8) {
        markTouchPlaceMoved();
        setIsPanning(true);
        setLastPanPosition({ x: e.clientX, y: e.clientY });
      }
      return;
    }

    // Handle panning
    if (isPanning && lastPanPosition) {
      const dx = e.clientX - lastPanPosition.x;
      const dy = e.clientY - lastPanPosition.y;
      applyCameraImmediate(panCamera(cameraRef.current, -dx, -dy));
      setLastPanPosition({ x: e.clientX, y: e.clientY });
      const touchPan = getTouchPan();
      if (touchPan?.pointerId === e.pointerId) {
        const totalMove = Math.hypot(
          e.clientX - touchPan.origin.x,
          e.clientY - touchPan.origin.y
        );
        if (totalMove > 6) {
          markTouchPanMoved();
        }
      }
      return;
    }

    setMousePosition({ x, y });

    // Handle shape creation
    if (mode === "create" && shapeInCreation) {
      updateShapeInCreation(snapPointToGrid([x, y]));
    }
    // Handle selection
    else if (mode === "select" && dragVector) {
      const nextDragVector = new DOMVector(
        dragVector.x,
        dragVector.y,
        x - dragVector.x,
        y - dragVector.y
      );
      if (!isDragging && nextDragVector.getDiagonalLength() < 10) return;

      setIsDragging(true);
      setDragVector(nextDragVector);
      const rect = nextDragVector.toDOMRect();

      const selectedShapes = shapes.filter((shape) => {
        const [shapeX, shapeY] = shape.point;
        const [shapeWidth, shapeHeight] = shape.size;
        // TODO: it's not working properly with text and tokens
        const shapeRect = new DOMVector(shapeX, shapeY, shapeWidth, shapeHeight).toDOMRect();
        return intersect(rect, shapeRect);
      });

      if (selectedShapes.length > 0) {
        setSelectedShapeIds(selectedShapes.map((shape) => shape.id));
      } else {
        setSelectedShapeIds([]);
      }
    }
  }

  const onPointerUpCanvas = (e: React.PointerEvent<SVGElement>) => {
    const normalizeShape = (shape: Shape): Shape => {
      const [w, h] = shape.size;
      const [px, py] = shape.point;
      if (w >= 0 && h >= 0) return shape;
      const nextX = w < 0 ? px + w : px;
      const nextY = h < 0 ? py + h : py;
      return { ...shape, point: [nextX, nextY], size: [Math.abs(w), Math.abs(h)] };
    };

    const touchPan = getTouchPan();
    if (touchPan?.pointerId === e.pointerId) {
      setTouchPan(null);
      if (!touchPan.hasMoved && mode === "select") {
        setSelectedShapeIds([]);
      }
    }

    const touchPlace = getTouchPlace();
    if (touchPlace?.pointerId === e.pointerId) {
      setTouchPlace(null);
      if (!touchPlace.hasMoved && selectedHandCardId) {
        playCardAt(selectedHandCardId, e.clientX, e.clientY);
        setSelectedHandCardId(null);
        e.currentTarget.releasePointerCapture(e.pointerId);
        return;
      }
    }

    // Handle panning end
    if (isPanning) {
      setIsPanning(false);
      setLastPanPosition(null);
      e.currentTarget.releasePointerCapture(e.pointerId);
      return;
    }

    // Handle shape creation end
    if (mode === "create" && shapeInCreation) {
      e.currentTarget.releasePointerCapture(e.pointerId);
      const normalizedShape = normalizeShape(shapeInCreation.shape);
      setShapes((prevShapes) => [...prevShapes, normalizedShape]);
      setShapeInCreation(null);
      setMode("select");
    }
    // Handle selection end
    else if (mode === "select") {
      if (isDragging) {
        setDragVector(null);
        setIsDragging(false);
      } else {
        setSelectedShapeIds([]);
        setDragVector(null);
      }
    }
  };

  function onTextBlur() {
    if (editingText?.text === "") {
      setShapes((prevShapes) =>
        prevShapes.filter((shape) => shape.id !== editingText.id)
      );
    }
    setEditingText(null);
    setMode("select");
  }

  const updateDraggingRef = (newRef: { shape: Shape; origin: number[] } | null) => {
    rDragging.current = newRef;
  };

  // Effects
  useEffect(() => {
    if (!isDraggingShape || mode !== "select" || !isSnapEnabled) {
      clearSmartGuides();
    }
  }, [clearSmartGuides, isDraggingShape, isSnapEnabled, mode]);

  useEffect(() => {
    if (isPanning) {
      document.body.style.cursor = "grabbing";
    } else if (isSpacePressed) {
      document.body.style.cursor = "grab";
    } else {
      document.body.style.cursor = "default";
    }
  }, [isPanning, isSpacePressed]);

  useEffect(() => {
    if (!data || sessionHydrationStatus === "pending") return;
    if (sessionHydrationStatus === "restored") return;
    const initialDeck: Card[] = mapDataToCards(data);
    dispatch({ type: "INITIALIZE_DECK", payload: initialDeck });
    toast(`Deck initialized with ${initialDeck.length} cards`);
  }, [data, dispatch, sessionHydrationStatus]);


  useKeyboardShortcuts({
    isSetupComplete,
    editingText,
    selectedShapeIds,
    shapes,
    isPanning,
    showCounterControls,
    onUndo: undo,
    onRedo: redo,
    onSetIsCommandPressed: setIsCommandPressed,
    onSetIsSpacePressed: setIsSpacePressed,
    onToggleHelp: () => setShowHelp((prev) => !prev),
    onSetShowCounterControls: setShowCounterControls,
    applyZoomStepRef,
    engageCardRef,
    drawCardRef,
    onDeleteSelected: () => {
      setShapes((prevShapes) =>
        prevShapes.filter((shape) => !selectedShapeIds.includes(shape.id))
      );
      setSelectedShapeIds([]);
    },
  });

  // Auto-close counter controls if selection becomes invalid
  useEffect(() => {
    if (showCounterControls) {
      // Close if not exactly 1 shape selected, or if selected shape is not a card
      if (selectedShapeIds.length !== 1) {
        setShowCounterControls(false);
      } else {
        const selectedShape = shapes.find(s => s.id === selectedShapeIds[0]);
        if (!selectedShape || selectedShape.type !== "image") {
          setShowCounterControls(false);
        }
      }
    }
  }, [selectedShapeIds, shapes, showCounterControls]);

  // Render preparation
  const receivedData: Shape[] = Object.values(receivedDataMap).flat();
  const others = receivedData;
  const transform = `scale(${camera.z}) translate(${camera.x}px, ${camera.y}px)`;
  const editingTextShape = shapes.find((shape) => shape.id === editingText?.id);
  const shapesFiltered = shapes.filter((shape) => shape.id !== editingText?.id);

  const viewportWorldBounds = useMemo(() => {
    if (viewportSize.width === 0 || viewportSize.height === 0) {
      return null;
    }
    const topLeft = screenToWorld([0, 0], camera);
    const bottomRight = screenToWorld(
      [viewportSize.width, viewportSize.height],
      camera
    );
    return {
      minX: Math.min(topLeft[0], bottomRight[0]),
      maxX: Math.max(topLeft[0], bottomRight[0]),
      minY: Math.min(topLeft[1], bottomRight[1]),
      maxY: Math.max(topLeft[1], bottomRight[1]),
    };
  }, [camera, viewportSize]);


  if (!isSetupComplete) {
    return (
      <SetupScreen
        deckParam={deckParam}
        peer={peer}
        connections={connections}
        connectToPeer={connectToPeer}
        error={error}
        isDeckLoading={isDeckLoading}
        deckError={deckError ?? null}
        deckNames={deckNames}
        onSetupComplete={() => setIsSetupComplete(true)}
      />
    );
  }

  return (
    <div>
      <ContextMenu
        onEngageDisengageCard={engageSelected}
        onFlip={flipSelectedShapes}
        sendBackToDeck={sendBackToDeck}
        copy={copySelected}
        sendBackToHand={sendBackToHand}
        sendCardToFront={sendSelectedToFront}
        sendCardToBack={sendSelectedToBack}
        increaseSrcIndex={increaseSrcIndexOnSelected}
        onManageCounters={() => setShowCounterControls(true)}
        onClearCounters={clearCountersOnSelected}
      >
        <svg
          className="canvas-surface fixed inset-0 h-full w-full bg-white shadow-none"
          ref={ref}
          onPointerDownCapture={onPointerDownCaptureCanvas}
          onPointerMoveCapture={onPointerMoveCaptureCanvas}
          onPointerUpCapture={onPointerUpCaptureCanvas}
          onPointerCancelCapture={onPointerUpCaptureCanvas}
          onPointerDown={onPointerDownCanvas}
          onPointerMove={onPointerMoveCanvas}
          onPointerUp={onPointerUpCanvas}
          onPointerCancel={onPointerUpCanvas}
        >
          <g style={{ transform }}>
            {isSnapEnabled &&
              viewportWorldBounds &&
              (smartGuides.vertical !== null || smartGuides.horizontal !== null) && (
                <g className="pointer-events-none" pointerEvents="none">
                  {smartGuides.vertical !== null && (
                    <line
                      x1={smartGuides.vertical}
                      y1={viewportWorldBounds.minY}
                      x2={smartGuides.vertical}
                      y2={viewportWorldBounds.maxY}
                      stroke="#2563eb"
                      strokeWidth={1}
                      strokeDasharray="6 4"
                      vectorEffect="non-scaling-stroke"
                    />
                  )}
                  {smartGuides.horizontal !== null && (
                    <line
                      x1={viewportWorldBounds.minX}
                      y1={smartGuides.horizontal}
                      x2={viewportWorldBounds.maxX}
                      y2={smartGuides.horizontal}
                      stroke="#2563eb"
                      strokeWidth={1}
                      strokeDasharray="6 4"
                      vectorEffect="non-scaling-stroke"
                    />
                  )}
                </g>
              )}
            {/* Render other players' shapes */}
            {others.map((shape) => (
              <ShapeComponent
                readOnly={true}
                key={shape.id}
                shape={shape}
                mode={mode}
                rDragging={{ current: null }}
                inputRef={{ current: null }}
                camera={camera}
                setHoveredCard={setHoveredCard}
                updateDraggingRef={() => { }}
                selected={selectedShapeIds.includes(shape.id)}
                snapToGrid={snapPointToGrid}
              />
            ))}

            {/* Render local shapes */}
            {shapesFiltered.map((shape) => (
              <ShapeComponent
                readOnly={false}
                key={shape.id}
                shape={shape}
                mode={mode}
                camera={camera}
                rDragging={rDragging}
                inputRef={inputRef}
                setHoveredCard={setHoveredCard}
                updateDraggingRef={updateDraggingRef}
                selected={selectedShapeIds.includes(shape.id)}
                color={shape.color}
                onToggleTap={tapShape}
                snapToGrid={snapPointToGrid}
              />
            ))}

            {/* Render shape in creation */}
            {shapeInCreation && (
              <ShapeComponent
                readOnly={false}
                key={shapeInCreation.shape.id}
                shape={shapeInCreation.shape}
                mode={mode}
                camera={camera}
                inputRef={inputRef}
                rDragging={rDragging}
                setHoveredCard={setHoveredCard}
                updateDraggingRef={updateDraggingRef}
                selected={selectedShapeIds.includes(shapeInCreation.shape.id)}
                snapToGrid={snapPointToGrid}
              />
            )}

            {/* Render editing text shape */}
            {editingText && (
              <EditingTextShape
                editingTextShape={editingTextShape}
                onTextBlur={onTextBlur}
                inputRef={inputRef}
                editingText={editingText}
                setEditingText={setEditingText}
                setShapes={setShapes}
              />
            )}

            {dragPreview && (
              <g pointerEvents="none">
                <image
                  href={dragPreview.faceDown ? CARD_BACK_URL : dragPreview.src}
                  x={dragPreview.point[0]}
                  y={dragPreview.point[1]}
                  width={CARD_PREVIEW_SIZE[0]}
                  height={CARD_PREVIEW_SIZE[1]}
                  opacity={0.75}
                  style={{ filter: "drop-shadow(0 3px 6px rgba(0, 0, 0, 0.25))" }}
                />
                <rect
                  x={dragPreview.point[0]}
                  y={dragPreview.point[1]}
                  width={CARD_PREVIEW_SIZE[0]}
                  height={CARD_PREVIEW_SIZE[1]}
                  fill="none"
                  stroke="rgba(90, 68, 40, 0.6)"
                  strokeWidth={2}
                  strokeDasharray="6 4"
                />
              </g>
            )}

            {/* Render selection rectangle */}
            {selectionRect && (
              <rect
                x={selectionRect.x}
                y={selectionRect.y}
                width={selectionRect.width}
                height={selectionRect.height}
                fill="rgba(0, 0, 255, 0.3)"
                stroke="blue"
              />
            )}
          </g>
        </svg>
      </ContextMenu>

      <div>
        <SelectionPanel
          setCamera={setCamera}
          setMode={setMode}
          mode={mode}
          onMulligan={mulligan}
          onDrawCard={drawCard}
          onNewGame={startNewGame}
          showHelp={showHelp}
          onToggleHelp={() => setShowHelp((prev) => !prev)}
          onShuffleDeck={onShuffleDeck}
          cards={data}
          relatedCards={relatedCards}
          addCardToHand={addCardToHand}
          addToken={addToken}
          changeColor={changeColorOnSelected}
          shapeType={shapeType}
          setShapeType={setShapeType}
          deck={deck}
          peerPresence={peerPresence}
          heartbeatStaleMs={HEARTBEAT_STALE_MS}
          peerNames={peerNames}
          rollCoin={rollCoin}
          rollD6={() => rollDie(6)}
          rollD20={() => rollDie(20)}
          pickStarter={pickStarter}
          untapAll={untapAll}
          isSnapEnabled={isSnapEnabled}
          onToggleSnap={() => setIsSnapEnabled((prev) => !prev)}
        />
      </div>

      <Hand
        cards={cards}
        setHoveredCard={setHoveredCard}
        selectedCardId={selectedHandCardId}
        onSelectCard={setSelectedHandCardId}
        onDragStartCard={handleHandDragStart}
        onPlayCardFromMenu={playHandCardFromMenu}
        onMoveCardToDeck={moveHandCardToDeck}
        draggingCardId={draggingHandCardId}
      />

      {handDrag && (
        <div
          className="hand-drag-ghost fixed z-(--z-ghost) pointer-events-none -translate-x-1/2 -translate-y-[70%] flex flex-col items-center"
          style={{ left: handDrag.clientX, top: handDrag.clientY }}
        >
          <img
            className="hand-drag-ghost__card w-[180px] h-auto -rotate-2 rounded-[6px] shadow-[0_12px_24px_rgba(0,0,0,0.35),0_0_0_2px_rgba(255,255,255,0.65)] bg-white"
            src={handDrag.faceDown ? CARD_BACK_URL : handDrag.src}
            alt="Dragging card"
          />
        </div>
      )}

      {/* Zoomed card preview */}
      {isCommandPressed && hoveredCard && (
        <div
          className="zoomed-card fixed top-2.5 right-2.5 z-(--z-zoomed-card) h-[700px] max-[720px]:h-[min(45vh,320px)] aspect-[488/680] overflow-hidden border-2 border-black bg-white shadow-[0_4px_8px_rgba(0,0,0,0.2)]"
          style={{ pointerEvents: "none" }}
        >
          <img
            className="block h-full w-full object-cover"
            src={hoveredCard}
            alt={`Zoomed ${hoveredCard}`}
          />
        </div>
      )}

      <ShortcutDock
        isMobile={isMobile}
        isOpen={isShortcutDockOpen}
        onToggle={() => setIsShortcutDockOpen((prev) => !prev)}
      />

      <HelpPanel
        showHelp={showHelp}
        onToggleHelp={() => setShowHelp(false)}
      />

      {/* Counter Controls Panel */}
      {showCounterControls && selectedShapeIds.length === 1 && (() => {
        const selectedShape = shapes.find(s => s.id === selectedShapeIds[0]);
        return selectedShape && selectedShape.type === "image" ? (
          <CounterControls
            currentCounters={selectedShape.counters || []}
            onUpdateCounters={updateCountersOnSelected}
            onClose={() => setShowCounterControls(false)}
          />
        ) : null;
      })()}

    </div>
  );
}

export default Canvas;

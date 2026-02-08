import * as React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { Handler, useGesture } from "@use-gesture/react";

import { Shape as ShapeComponent } from "./Shape";
import Grid from "./Grid";
import { DOMVector, screenToCanvas } from "./utils/vec";
import Hand from "./Hand";
import ContextMenu from "./ContextMenu";
import CounterControls from "./components/CounterControls";
import useCards, {
  Datum,
  mapDataToCards,
  processRawText,
} from "./hooks/useCards";
import { usePeerStore } from "./hooks/usePeerConnection";
import { generateId } from "./utils/math";
import { useCardReducer } from "./hooks/useCardReducer";
import { DEFAULT_DECK } from "./DEFAULT_DECK";
import { getCameraZoom, panCamera, screenToWorld } from "./utils/canvas_utils";
import { SelectionPanel } from "./SelectionPanel";
import inputs, { normalizeWheel } from "./inputs";
import { useShapeStore } from "./hooks/useShapeStore";
import EditingTextShape from "./EditingTextShape";
import type { ActionLogEntry } from "./ActionLog";

import {
  Point,
  Card,
  Camera,
  Shape,
  ShapeType,
  Mode,
  Counter,
  rotateShape,
  flipShape,
  intersect,
} from "./types/canvas";

const logActionToConsole = (
  entry: ActionLogEntry,
  origin: string = "Action Log"
) => {
  const name = entry.playerName || entry.playerId || "Player";
  const time = entry.timestamp
    ? new Date(entry.timestamp).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
    : null;
  const summary = `${name} (${entry.cardsInHand} in hand): ${entry.action}`;
  const suffix = time ? ` @ ${time}` : "";
  console.info(`[${origin}] ${summary}${suffix}`);
};

const HEARTBEAT_INTERVAL_MS = 5000;
const HEARTBEAT_STALE_MS = HEARTBEAT_INTERVAL_MS * 3;
const MAX_ACTION_LOG_ENTRIES = 50;
const CARD_ACTION_DESCRIPTIONS: Record<string, string> = {
  DRAW_CARD: "drew a card",
  MULLIGAN: "took a mulligan",
  SEND_TO_HAND: "moved cards to hand",
  SEND_TO_DECK: "returned cards to the deck",
  MOVE_HAND_TO_DECK: "returned a card to the deck",
  PLAY_CARD: "played a card",
  ADD_TO_HAND: "searched a card",
  SHUFFLE_DECK: "shuffled the deck",
};
const GRID_SIZE = 50;
const CARD_PREVIEW_SIZE: [number, number] = [100, 100];
const CARD_BACK_URL = "https://i.imgur.com/LdOBU1I.jpeg";

type ShortcutSection = {
  title: string;
  items: string[];
};

type DragCardMeta = {
  id: string;
  src: string;
  faceDown: boolean;
};

type HandDragState = DragCardMeta & {
  pointerId: number;
  clientX: number;
  clientY: number;
  target: HTMLElement | null;
};

type DragPreview = DragCardMeta & {
  point: [number, number];
};

const HELP_SHORTCUT_SECTIONS: ShortcutSection[] = [
  {
    title: "Panning",
    items: [
      "One-finger drag on empty canvas (touch)",
      "Two-finger drag (touch)",
      "Two-finger scroll (trackpad)",
      "Middle mouse button + drag",
      "Space + drag",
      "Alt + drag",
    ],
  },
  {
    title: "Zooming",
    items: [
      "Pinch (touch)",
      "Pinch gesture (trackpad)",
      "Ctrl + scroll wheel",
      "+ / - keys",
    ],
  },
  {
    title: "Card Actions",
    items: [
      "T = tap/untap selected card",
      "C = manage counters on selected card",
      "D = draw a card",
      "Right-click = action menu",
      "Tap card in hand, then tap canvas to play (touch)",
      "Ctrl + hover = preview",
    ],
  },
  {
    title: "Other",
    items: [
      "Cmd/Ctrl + Z = undo",
      "Shift + Cmd/Ctrl + Z = redo",
      "Backspace = delete selected",
      "? = toggle this help",
    ],
  },
];

const PRIMARY_HELP_SHORTCUT_SECTIONS = HELP_SHORTCUT_SECTIONS.filter(
  (section) => section.title !== "Other"
);
const OTHER_HELP_SHORTCUT_SECTION = HELP_SHORTCUT_SECTIONS.find(
  (section) => section.title === "Other"
);

const KEYBOARD_SHORTCUT_SECTIONS: ShortcutSection[] = [
  {
    title: "Panning",
    items: ["Space + drag", "Alt + drag"],
  },
  {
    title: "Zooming",
    items: ["Ctrl + scroll wheel", "+ / - keys"],
  },
  {
    title: "Card Actions",
    items: [
      "T = tap/untap selected card",
      "C = manage counters on selected card",
      "D = draw a card",
      "Ctrl + hover = preview",
    ],
  },
  {
    title: "Other",
    items: [
      "Cmd/Ctrl + Z = undo",
      "Shift + Cmd/Ctrl + Z = redo",
      "Backspace = delete selected",
      "? = toggle this help",
    ],
  },
];

type RandomEventType = "coin" | "d6" | "d20" | "starter";

function generatePlayerName() {
  const adjectives = [
    "Swift",
    "Arcane",
    "Silent",
    "Crimson",
    "Verdant",
    "Luminous",
    "Shadow",
    "Iron",
    "Lucky",
    "Misty",
  ];
  const nouns = [
    "Falcon",
    "Mage",
    "Knight",
    "Wisp",
    "Golem",
    "Druid",
    "Rogue",
    "Phoenix",
    "Sphinx",
    "Voyager",
  ];
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  const suffix = Math.floor(Math.random() * 900 + 100); // 3-digit for uniqueness
  return `${adj} ${noun} #${suffix}`;
}

function describeRandomEvent(event: { type: RandomEventType; result: string }) {
  switch (event.type) {
    case "coin":
      return `flipped a coin: ${event.result}`;
    case "d6":
      return `rolled a d6: ${event.result}`;
    case "d20":
      return `rolled a d20: ${event.result}`;
    case "starter":
      return `starting player: ${event.result}`;
    default:
      return `random: ${event.result}`;
  }
}

function Canvas() {
  // Shape store state and actions
  const {
    shapes,
    selectedShapeIds,
    shapeInCreation,
    editingText,
    setShapes,
    setSelectedShapeIds,
    setShapeInCreation,
    setEditingText,
    createShape,
    updateShapeInCreation,
    undo,
    redo,
  } = useShapeStore();

  // Peer connection state and actions
  const {
    initPeer,
    connectToPeer,
    disconnect,
    sendMessage,
    onMessage,
    peer,
    error,
    connections,
  } = usePeerStore();

  // Local state
  const [isDragging, setIsDragging] = useState(false);
  const [dragVector, setDragVector] = useState<DOMVector | null>(null);
  const [camera, setCamera] = useState<Camera>({ x: 0, y: 0, z: 1 });
  const [mode, setMode] = useState<Mode>("select");
  const [shapeType, setShapeType] = useState<ShapeType>("text");
  const [receivedDataMap, setReceivedDataMap] = useState<
    Record<string, Shape[]>
  >({});
  const [peerPresence, setPeerPresence] = useState<Record<string, number>>({});
  const [peerNames, setPeerNames] = useState<Record<string, string>>({});
  const [, setActionLog] = useState<ActionLogEntry[]>([]);
  const [hoveredCard, setHoveredCard] = useState<string | null>(null);
  const [isCommandPressed, setIsCommandPressed] = useState(false);
  const [isSpacePressed, setIsSpacePressed] = useState(false);
  const [, setMousePosition] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [lastPanPosition, setLastPanPosition] = useState<Point | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [isShortcutDockOpen, setIsShortcutDockOpen] = useState(true);
  const [isGridVisible, setIsGridVisible] = useState(false);
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
  const [selectedHandCardId, setSelectedHandCardId] = useState<string | null>(null);
  const [dragPreview, setDragPreview] = useState<DragPreview | null>(null);
  const [draggingHandCardId, setDraggingHandCardId] = useState<string | null>(null);
  const [handDrag, setHandDrag] = useState<HandDragState | null>(null);

  // Refs
  const ref = useRef<SVGSVGElement>(null);
  const rDragging = useRef<{ shape: Shape; origin: number[] } | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const handDragRef = useRef<HandDragState | null>(null);
  const playCardAtRef = useRef<
    (cardId: string, clientX: number, clientY: number, playFaceDown?: boolean) => boolean
  >(() => false);
  const updateDragPreviewAtRef = useRef<
    (clientX: number, clientY: number, meta: DragCardMeta) => void
  >(() => {});
  const isPointerOverCanvasRef = useRef<(clientX: number, clientY: number) => boolean>(
    () => false
  );
  const resetHandDragStateRef = useRef(() => {});
  const drawCardRef = useRef<() => void>(() => {});
  const engageCardRef = useRef<() => void>(() => {});
  const lastLoggedActionId = useRef<number | undefined>(undefined);
  const playerNameRef = useRef<string>(generatePlayerName());
  const actionLogRef = useRef<ActionLogEntry[]>([]);
  const cameraRef = useRef(camera);
  const cameraTargetRef = useRef(camera);
  const cameraVelocityRef = useRef({ x: 0, y: 0, z: 0 });
  const cameraAnimationRef = useRef<number | null>(null);
  const cameraLastTimeRef = useRef<number | null>(null);
  const zoomAnchorRef = useRef<{
    screen: number[];
    world: number[];
  } | null>(null);
  const touchPointersRef = useRef(new Map<number, { x: number; y: number }>());
  const touchGestureRef = useRef<{
    isActive: boolean;
    startDistance: number;
    startMidpoint: [number, number];
    startCamera: Camera;
    startWorldPoint: [number, number];
  }>({
    isActive: false,
    startDistance: 0,
    startMidpoint: [0, 0],
    startCamera: { x: 0, y: 0, z: 1 },
    startWorldPoint: [0, 0],
  });
  const touchPanRef = useRef<{
    pointerId: number;
    origin: { x: number; y: number };
    hasMoved: boolean;
  } | null>(null);
  const touchPlaceRef = useRef<{
    pointerId: number;
    origin: { x: number; y: number };
    hasMoved: boolean;
  } | null>(null);

  const applyCameraImmediate = (next: Camera) => {
    if (cameraAnimationRef.current !== null) {
      cancelAnimationFrame(cameraAnimationRef.current);
      cameraAnimationRef.current = null;
    }
    cameraLastTimeRef.current = null;
    cameraVelocityRef.current = { x: 0, y: 0, z: 0 };
    zoomAnchorRef.current = null;
    cameraTargetRef.current = next;
    cameraRef.current = next;
    setCamera(next);
  };

  const smoothDamp = (
    current: number,
    target: number,
    currentVelocity: number,
    smoothTime: number,
    maxSpeed: number,
    deltaTime: number
  ) => {
    const safeSmoothTime = Math.max(0.0001, smoothTime);
    const omega = 2 / safeSmoothTime;
    const x = omega * deltaTime;
    const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
    let change = current - target;
    const originalTo = target;
    const maxChange = maxSpeed * safeSmoothTime;
    change = Math.max(-maxChange, Math.min(maxChange, change));
    target = current - change;
    const temp = (currentVelocity + omega * change) * deltaTime;
    const nextVelocity = (currentVelocity - omega * temp) * exp;
    let output = target + (change + temp) * exp;

    if ((originalTo - current > 0) === (output > originalTo)) {
      output = originalTo;
      return { value: output, velocity: 0 };
    }

    return { value: output, velocity: nextVelocity };
  };

  const animateCamera = (time: number) => {
    const lastTime = cameraLastTimeRef.current ?? time;
    const deltaTime = Math.min(0.032, (time - lastTime) / 1000);
    cameraLastTimeRef.current = time;

    const current = cameraRef.current;
    const target = cameraTargetRef.current;
    const velocity = cameraVelocityRef.current;

    const nextX = smoothDamp(
      current.x,
      target.x,
      velocity.x,
      0.14,
      8000,
      deltaTime
    );
    const nextY = smoothDamp(
      current.y,
      target.y,
      velocity.y,
      0.14,
      8000,
      deltaTime
    );
    const nextZ = smoothDamp(
      current.z,
      target.z,
      velocity.z,
      0.12,
      20,
      deltaTime
    );
    const zoomAnchor = zoomAnchorRef.current;
    const anchoredX = zoomAnchor
      ? zoomAnchor.screen[0] / nextZ.value - zoomAnchor.world[0]
      : nextX.value;
    const anchoredY = zoomAnchor
      ? zoomAnchor.screen[1] / nextZ.value - zoomAnchor.world[1]
      : nextY.value;

    const nextCamera = { x: anchoredX, y: anchoredY, z: nextZ.value };
    cameraVelocityRef.current = {
      x: zoomAnchor ? 0 : nextX.velocity,
      y: zoomAnchor ? 0 : nextY.velocity,
      z: nextZ.velocity,
    };
    cameraRef.current = nextCamera;
    setCamera(nextCamera);

    const positionDelta = Math.hypot(
      nextCamera.x - target.x,
      nextCamera.y - target.y
    );
    const zoomDelta = Math.abs(nextCamera.z - target.z);
    const velocityDelta =
      Math.abs(cameraVelocityRef.current.x) +
      Math.abs(cameraVelocityRef.current.y) +
      Math.abs(cameraVelocityRef.current.z);

    if (positionDelta < 0.01 && zoomDelta < 0.0005 && velocityDelta < 0.002) {
      cameraRef.current = target;
      cameraVelocityRef.current = { x: 0, y: 0, z: 0 };
      zoomAnchorRef.current = null;
      cameraAnimationRef.current = null;
      cameraLastTimeRef.current = null;
      setCamera(target);
      return;
    }

    cameraAnimationRef.current = requestAnimationFrame(animateCamera);
  };

  const applyCameraTarget = (next: Camera) => {
    cameraTargetRef.current = next;
    if (cameraAnimationRef.current === null) {
      cameraAnimationRef.current = requestAnimationFrame(animateCamera);
    }
  };

  const applyZoomDelta = (point: number[], delta: number) => {
    if (delta === 0) return;
    const current = cameraRef.current;
    const target = cameraTargetRef.current;
    const zoomFactor = Math.exp(-delta * 0.008);
    const nextZ = getCameraZoom(target.z * zoomFactor);
    const worldPoint = screenToWorld(point, current);
    zoomAnchorRef.current = { screen: point, world: worldPoint };
    const nextX = point[0] / nextZ - worldPoint[0];
    const nextY = point[1] / nextZ - worldPoint[1];
    applyCameraTarget({ x: nextX, y: nextY, z: nextZ });
  };

  const applyZoomStep = (point: number[], direction: "in" | "out") => {
    const factor = direction === "in" ? 1.12 : 1 / 1.12;
    const current = cameraRef.current;
    const target = cameraTargetRef.current;
    const nextZ = getCameraZoom(target.z * factor);
    const worldPoint = screenToWorld(point, current);
    zoomAnchorRef.current = { screen: point, world: worldPoint };
    const nextX = point[0] / nextZ - worldPoint[0];
    const nextY = point[1] / nextZ - worldPoint[1];
    applyCameraTarget({ x: nextX, y: nextY, z: nextZ });
  };

  useEffect(() => {
    cameraRef.current = camera;
  }, [camera]);

  useEffect(() => {
    return () => {
      if (cameraAnimationRef.current !== null) {
        cancelAnimationFrame(cameraAnimationRef.current);
      }
    };
  }, []);

  const updateActionLog = (
    updater: (prev: ActionLogEntry[]) => ActionLogEntry[]
  ) => {
    setActionLog((prev) => {
      const next = updater(prev);
      actionLogRef.current = next;
      return next;
    });
  };

  const addActionLogEntry = (entry: ActionLogEntry) => {
    logActionToConsole(entry);
    updateActionLog((prev) => [...prev, entry].slice(-MAX_ACTION_LOG_ENTRIES));
  };

  const updateActionLogRef = useRef(updateActionLog);
  const addActionLogEntryRef = useRef(addActionLogEntry);
  const applyZoomStepRef = useRef(applyZoomStep);

  updateActionLogRef.current = updateActionLog;
  addActionLogEntryRef.current = addActionLogEntry;
  applyZoomStepRef.current = applyZoomStep;

  const sendRandomEvent = (event: { type: RandomEventType; result: string }) => {
    const entry: ActionLogEntry = {
      playerId: peer?.id ?? "You",
      playerName: playerNameRef.current,
      action: describeRandomEvent(event),
      cardsInHand: cards.length,
      timestamp: Date.now(),
    };
    addActionLogEntry(entry);
    if (peer?.id) {
      sendMessage({
        type: "random-event",
        payload: {
          ...event,
          peerId: peer.id,
          playerName: playerNameRef.current,
          timestamp: entry.timestamp,
        },
      });
    }
  };

  const rollCoin = () => {
    const result = Math.random() < 0.5 ? "Heads" : "Tails";
    sendRandomEvent({ type: "coin", result });
  };

  const rollDie = (sides: number) => {
    const result = Math.floor(Math.random() * sides) + 1;
    const type = sides === 6 ? "d6" : "d20";
    sendRandomEvent({ type, result: result.toString() });
  };

  const pickStarter = () => {
    const participantIds = Array.from(new Set([peer?.id, ...connections.keys()].filter(Boolean))) as string[];
    if (participantIds.length === 0) return;
    const chosen = participantIds[Math.floor(Math.random() * participantIds.length)];
    const name = peerNames[chosen] || chosen;
    sendRandomEvent({ type: "starter", result: name });
  };

  // URL parameters
  const location = useLocation();
  const navigate = useNavigate();
  const params = new URLSearchParams(location.search);
  const deckParam = params.get("deck") ?? "";

  const [setupStep, setSetupStep] = useState<"deck" | "multiplayer">(() =>
    deckParam.trim() ? "multiplayer" : "deck"
  );
  const [isSetupComplete, setIsSetupComplete] = useState(false);
  const [deckDraft, setDeckDraft] = useState(() => deckParam);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [setupPeerId, setSetupPeerId] = useState("");
  const [setupCopied, setSetupCopied] = useState(false);

  const deckDraftCount = processRawText(deckDraft).length;
  const deckNames = deckParam.trim()
    ? processRawText(deckParam.trim())
    : [];

  const handleDeckContinue = () => {
    const trimmed = deckDraft.trim();
    const parsed = processRawText(trimmed);
    if (parsed.length === 0) {
      setSetupError("Paste a deck list to continue.");
      return;
    }
    const nextParams = new URLSearchParams(location.search);
    nextParams.set("deck", trimmed);
    navigate(`${location.pathname}?${nextParams.toString()}`, { replace: true });
    setSetupError(null);
    setSetupStep("multiplayer");
  };

  const handleUseSampleDeck = () => {
    setDeckDraft(DEFAULT_DECK.join("\n"));
    setSetupError(null);
  };

  const handleCopyPeerId = () => {
    if (!peer?.id) return;
    navigator.clipboard.writeText(peer.id);
    setSetupCopied(true);
    window.setTimeout(() => setSetupCopied(false), 2000);
  };

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
  const { cards, deck, lastAction } = cardState;
  const cardStateRef = useRef(cardState);

  useEffect(() => {
    cardStateRef.current = cardState;
  }, [cardState]);

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

  const getTouchGestureStats = () => {
    const points = Array.from(touchPointersRef.current.values());
    if (points.length < 2) return null;
    const [p1, p2] = points.slice(0, 2);
    const midpoint: [number, number] = [
      (p1.x + p2.x) / 2,
      (p1.y + p2.y) / 2,
    ];
    const distance = Math.hypot(p1.x - p2.x, p1.y - p2.y);
    if (!Number.isFinite(distance) || distance === 0) return null;
    return { midpoint, distance };
  };

  const resetTouchInteractions = () => {
    if (touchPanRef.current && ref.current?.hasPointerCapture(touchPanRef.current.pointerId)) {
      ref.current.releasePointerCapture(touchPanRef.current.pointerId);
    }
    touchPanRef.current = null;
    if (touchPlaceRef.current && ref.current?.hasPointerCapture(touchPlaceRef.current.pointerId)) {
      ref.current.releasePointerCapture(touchPlaceRef.current.pointerId);
    }
    touchPlaceRef.current = null;
    setIsPanning(false);
    setLastPanPosition(null);
    setDragVector(null);
    setIsDragging(false);
    rDragging.current = null;
    useShapeStore.setState({ isDraggingShape: false });
  };

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
    if (typeof document === "undefined") return;
    if (handDrag) {
      document.body.classList.add("hand-dragging");
    } else {
      document.body.classList.remove("hand-dragging");
    }
    return () => {
      document.body.classList.remove("hand-dragging");
    };
  }, [handDrag]);

  const snapPointToGrid = (point: [number, number]) => {
    if (!isSnapEnabled) return point;
    const [x, y] = point;
    const snappedX = Math.round(x / GRID_SIZE) * GRID_SIZE;
    const snappedY = Math.round(y / GRID_SIZE) * GRID_SIZE;
    return [snappedX, snappedY] as [number, number];
  };

  const clearDragPreview = () => {
    setDragPreview(null);
  };

  const resetHandDragState = () => {
    const current = handDragRef.current;
    if (current?.target && current.pointerId != null) {
      try {
        current.target.releasePointerCapture(current.pointerId);
      } catch {
        // Ignore release errors if capture is already gone.
      }
    }
    handDragRef.current = null;
    setHandDrag(null);
    setDraggingHandCardId(null);
    clearDragPreview();
  };

  const isPointerOverCanvas = (clientX: number, clientY: number) => {
    if (typeof document === "undefined") return false;
    const svg = ref.current;
    if (!svg) return false;
    const rect = svg.getBoundingClientRect();
    return (
      clientX >= rect.left &&
      clientX <= rect.right &&
      clientY >= rect.top &&
      clientY <= rect.bottom
    );
  };

  const updateDragPreviewAt = (clientX: number, clientY: number, meta: DragCardMeta) => {
    if (!isPointerOverCanvas(clientX, clientY)) {
      clearDragPreview();
      return;
    }
    const { x, y } = screenToCanvas(
      { x: clientX, y: clientY },
      cameraRef.current
    );
    const [snappedX, snappedY] = snapPointToGrid([x, y]);
    const nextPreview: DragPreview = {
      ...meta,
      point: [snappedX, snappedY],
    };
    setDragPreview((prev) => {
      if (
        prev &&
        prev.id === nextPreview.id &&
        prev.faceDown === nextPreview.faceDown &&
        prev.point[0] === nextPreview.point[0] &&
        prev.point[1] === nextPreview.point[1]
      ) {
        return prev;
      }
      return nextPreview;
    });
  };

  const handleHandDragStart = (payload: HandDragState) => {
    const meta: DragCardMeta = {
      id: payload.id,
      src: payload.src,
      faceDown: payload.faceDown,
    };
    handDragRef.current = payload;
    setHandDrag(payload);
    setDraggingHandCardId(payload.id);
    setSelectedHandCardId(null);
    updateDragPreviewAt(payload.clientX, payload.clientY, meta);
  };

  const playCardAt = (
    cardId: string,
    clientX: number,
    clientY: number,
    playFaceDown = false
  ) => {
    const { x, y } = screenToCanvas({ x: clientX, y: clientY }, cameraRef.current);
    const [snappedX, snappedY] = snapPointToGrid([x, y]);
    const card = cardStateRef.current.cards.find((c) => c.id === cardId);
    if (!card) return false;
    dispatch({ type: "PLAY_CARD", payload: [cardId] });
    setShapes((prevShapes) => [
      ...prevShapes,
      {
        id: generateId(),
        point: [snappedX, snappedY],
        size: [100, 100],
        type: "image",
        src: card.src,
        srcIndex: 0,
        rotation: 0,
        isFlipped: playFaceDown,
      },
    ]);
    return true;
  };

  const playHandCardFromMenu = (
    cardId: string,
    _point: { x: number; y: number } | null,
    faceDown: boolean
  ) => {
    const rect = ref.current?.getBoundingClientRect();
    const clientX = rect ? rect.left + rect.width / 2 : window.innerWidth / 2;
    const clientY = rect ? rect.top + rect.height / 2 : window.innerHeight / 2;
    playCardAt(cardId, clientX, clientY, faceDown);
  };

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

  const increaseSrcIndex = () => {
    setShapes((prevShapes) =>
      prevShapes.map((shape) => {
        if (selectedShapeIds.includes(shape.id) && shape.type === "image") {
          return {
            ...shape,
            srcIndex: (shape.srcIndex + 1) % (shape.src?.length ?? 1),
          };
        }
        return shape;
      })
    );
  };

  // Helper functions
  function removeSelectedImages() {
    setShapes((prevShapes) =>
      prevShapes.filter((shape) => {
        if (shape.type === "image") {
          return !selectedShapeIds.includes(shape.id);
        }
        return true;
      })
    );
    setSelectedShapeIds([]);
  }

  function getSelectedImages(): Card[] {
    return shapes
      .filter((shape) => selectedShapeIds.includes(shape.id))
      .filter((shape) => shape.type === "image")
      .map((shape) => ({
        id: shape.id,
        src: shape.src as string[],
        srcIndex: shape.srcIndex,
      }));
  }

  // Shape actions
  function onFlip() {
    if (mode === "select" && selectedShapeIds.length > 0) {
      setShapes((prevShapes) =>
        prevShapes.map((shape) =>
          selectedShapeIds.includes(shape.id) ? flipShape(shape) : shape
        )
      );
    }
  }

  function onEngageDisengageCard() {
    if (mode === "select" && selectedShapeIds.length > 0) {
      setShapes((prevShapes) =>
        prevShapes.map((shape) =>
          selectedShapeIds.includes(shape.id) &&
            (shape.type === "image" || shape.type === "rectangle")
            ? shape.rotation !== 0
              ? rotateShape(shape, -90)
              : rotateShape(shape, 90)
            : shape
        )
      );
    }
  }

  const onToggleTap = (shapeId: string) => {
    setShapes((prevShapes) =>
      prevShapes.map((shape) => {
        if (shape.id === shapeId && shape.type === "image") {
          const currentRotation = shape.rotation || 0;
          return { ...shape, rotation: currentRotation === 90 ? 0 : 90 };
        }
        return shape;
      })
    );
  };

  const onShuffleDeck = () => {
    dispatch({ type: "SHUFFLE_DECK" });
  };

  const untapAll = () => {
    setShapes((prevShapes) =>
      prevShapes.map((shape) =>
        (shape.type === "image" || shape.type === "rectangle") && shape.rotation
          ? { ...shape, rotation: 0 }
          : shape
      )
    );
  };

  const copy = () => {
    const selectedShapes = shapes
      .filter((shape) => selectedShapeIds.includes(shape.id))
      .map((shape) => ({
        ...shape,
        id: generateId(),
        point: [shape.point[0] + 100, shape.point[1] + 100],
      }));
    setShapes((prevShapes) => [...prevShapes, ...selectedShapes]);
  };

  const updateCounters = (newCounters: Counter[]) => {
    setShapes((prevShapes) =>
      prevShapes.map((shape) => {
        if (selectedShapeIds.includes(shape.id) && shape.type === "image") {
          return { ...shape, counters: newCounters };
        }
        return shape;
      })
    );
  };

  const clearCounters = () => {
    setShapes((prevShapes) =>
      prevShapes.map((shape) => {
        if (selectedShapeIds.includes(shape.id) && shape.type === "image") {
          return { ...shape, counters: [] };
        }
        return shape;
      })
    );
  };

  const addCardToHand = (card: Datum) => {
    dispatch({ type: "ADD_TO_HAND", payload: card });
  };

  const changeColor = (color: string) => {
    if (mode === "select" && selectedShapeIds.length === 1) {
      setShapes((prevShapes) =>
        prevShapes.map((shape) =>
          selectedShapeIds.includes(shape.id) ? { ...shape, color } : shape
        )
      );
    }
  };

  const sendCardToBack = () => {
    const selectedCards = shapes.filter((shape) =>
      selectedShapeIds.includes(shape.id)
    );
    setShapes((prevShapes) =>
      selectedCards.concat(
        prevShapes.filter((shape) => !selectedShapeIds.includes(shape.id))
      )
    );
    setSelectedShapeIds([]);
  };

  const sendCardToFront = () => {
    const selectedCards = shapes.filter((shape) =>
      selectedShapeIds.includes(shape.id)
    );
    setShapes((prevShapes) =>
      prevShapes
        .filter((shape) => !selectedShapeIds.includes(shape.id))
        .concat(selectedCards)
    );
    setSelectedShapeIds([]);
  };

  const onPointerDownCaptureCanvas = (e: React.PointerEvent<SVGElement>) => {
    if (e.pointerType !== "touch") return;
    touchPointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (touchPointersRef.current.size >= 2) {
      const gesture = getTouchGestureStats();
      if (gesture) {
        touchGestureRef.current = {
          isActive: true,
          startDistance: gesture.distance,
          startMidpoint: gesture.midpoint,
          startCamera: cameraRef.current,
          startWorldPoint: screenToWorld(gesture.midpoint, cameraRef.current),
        };
        resetTouchInteractions();
      }
    }

    if (touchGestureRef.current.isActive) {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  const onPointerMoveCaptureCanvas = (e: React.PointerEvent<SVGElement>) => {
    if (e.pointerType !== "touch") return;
    if (!touchPointersRef.current.has(e.pointerId)) return;
    touchPointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (!touchGestureRef.current.isActive || touchPointersRef.current.size < 2) {
      return;
    }

    const gesture = getTouchGestureStats();
    if (!gesture) return;

    const scale = gesture.distance / touchGestureRef.current.startDistance;
    const nextZ = getCameraZoom(touchGestureRef.current.startCamera.z * scale);
    const [worldX, worldY] = touchGestureRef.current.startWorldPoint;
    const [midX, midY] = gesture.midpoint;
    const nextX = midX / nextZ - worldX;
    const nextY = midY / nextZ - worldY;

    applyCameraImmediate({ x: nextX, y: nextY, z: nextZ });
    e.preventDefault();
    e.stopPropagation();
  };

  const onPointerUpCaptureCanvas = (e: React.PointerEvent<SVGElement>) => {
    if (e.pointerType !== "touch") return;
    const wasPinching = touchGestureRef.current.isActive;
    touchPointersRef.current.delete(e.pointerId);
    if (touchPointersRef.current.size < 2) {
      touchGestureRef.current.isActive = false;
    }

    if (wasPinching) {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  drawCardRef.current = drawCard;
  engageCardRef.current = onEngageDisengageCard;
  playCardAtRef.current = playCardAt;
  updateDragPreviewAtRef.current = updateDragPreviewAt;
  isPointerOverCanvasRef.current = isPointerOverCanvas;
  resetHandDragStateRef.current = resetHandDragState;

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const current = handDragRef.current;
      if (!current || event.pointerId !== current.pointerId) return;
      const next: HandDragState = {
        ...current,
        clientX: event.clientX,
        clientY: event.clientY,
      };
      handDragRef.current = next;
      setHandDrag(next);
      updateDragPreviewAtRef.current(event.clientX, event.clientY, current);
    };

    const handlePointerUp = (event: PointerEvent) => {
      const current = handDragRef.current;
      if (!current || event.pointerId !== current.pointerId) return;
      if (isPointerOverCanvasRef.current(event.clientX, event.clientY)) {
        playCardAtRef.current(
          current.id,
          event.clientX,
          event.clientY,
          current.faceDown
        );
      }
      resetHandDragStateRef.current();
    };

    const handleBlur = () => {
      if (handDragRef.current) {
        resetHandDragStateRef.current();
      }
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);
    window.addEventListener("blur", handleBlur);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
      window.removeEventListener("blur", handleBlur);
    };
  }, []);

  function onPointerDownCanvas(e: React.PointerEvent<SVGElement>) {
    if (handDragRef.current) {
      e.preventDefault();
      return;
    }
    const { x, y } = screenToCanvas({ x: e.clientX, y: e.clientY }, camera);
    const point = [x, y] as [number, number];
    const snappedPoint = snapPointToGrid(point);

    if (e.pointerType === "touch") {
      if (touchGestureRef.current.isActive) {
        return;
      }
      if (selectedHandCardId) {
        touchPlaceRef.current = {
          pointerId: e.pointerId,
          origin: { x: e.clientX, y: e.clientY },
          hasMoved: false,
        };
        e.currentTarget.setPointerCapture(e.pointerId);
        return;
      }
      if (mode === "select" && !shapeInCreation) {
        setIsPanning(true);
        setLastPanPosition({ x: e.clientX, y: e.clientY });
        touchPanRef.current = {
          pointerId: e.pointerId,
          origin: { x: e.clientX, y: e.clientY },
          hasMoved: false,
        };
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

    if (touchPlaceRef.current?.pointerId === e.pointerId && !touchPlaceRef.current.hasMoved) {
      const totalMove = Math.hypot(
        e.clientX - touchPlaceRef.current.origin.x,
        e.clientY - touchPlaceRef.current.origin.y
      );
      if (totalMove > 8) {
        touchPlaceRef.current.hasMoved = true;
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
      if (touchPanRef.current?.pointerId === e.pointerId) {
        const totalMove = Math.hypot(
          e.clientX - touchPanRef.current.origin.x,
          e.clientY - touchPanRef.current.origin.y
        );
        if (totalMove > 6) {
          touchPanRef.current.hasMoved = true;
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

    if (touchPanRef.current?.pointerId === e.pointerId) {
      const { hasMoved } = touchPanRef.current;
      touchPanRef.current = null;
      if (!hasMoved && mode === "select") {
        setSelectedShapeIds([]);
      }
    }

    if (touchPlaceRef.current?.pointerId === e.pointerId) {
      const { hasMoved } = touchPlaceRef.current;
      touchPlaceRef.current = null;
      if (!hasMoved && selectedHandCardId) {
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
    if (isPanning) {
      document.body.style.cursor = "grabbing";
    } else if (isSpacePressed) {
      document.body.style.cursor = "grab";
    } else {
      document.body.style.cursor = "default";
    }
  }, [isPanning, isSpacePressed]);

  useEffect(() => {
    if (!peer?.id) {
      return;
    }

    const peerId = peer.id;
    let rafId: number | null = null;
    let pendingShapes: Shape[] | null = null;

    const flush = () => {
      if (!pendingShapes) {
        rafId = null;
        return;
      }

      sendMessage({
        type: "shapes",
        payload: {
          id: peerId,
          data: pendingShapes,
        },
      });

      pendingShapes = null;
      rafId = null;
    };

    const emitSnapshot = (snapshot: Shape[]) => {
      sendMessage({
        type: "shapes",
        payload: {
          id: peerId,
          data: snapshot,
        },
      });
    };

    emitSnapshot(useShapeStore.getState().shapes);

    const unsubscribe = useShapeStore.subscribe((state, prevState) => {
      if (state.shapes === prevState.shapes) return;
      pendingShapes = state.shapes;
      if (rafId !== null) return;
      rafId = window.requestAnimationFrame(flush);
    });

    return () => {
      unsubscribe();
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
      }
    };
  }, [sendMessage, peer?.id]);

  useEffect(() => {
    if (data) {
      const initialDeck: Card[] = mapDataToCards(data);
      dispatch({ type: "INITIALIZE_DECK", payload: initialDeck });
      toast(`Deck initialized with ${initialDeck.length} cards`);
    }
  }, [data, dispatch]);

  useEffect(() => {
    initPeer();
    return () => {
      disconnect();
    };
  }, [initPeer, disconnect]);

  useEffect(() => {
    if (peer?.id) {
      setPeerNames((prev) => ({ ...prev, [peer.id]: playerNameRef.current }));
    }
  }, [peer?.id]);

  useEffect(() => {
    sendMessage({
      type: "playersInfo",
      payload: {
        peerId: peer?.id,
        data: {
          cardsInHand: cards.length,
          lastAction,
        },
      },
    });
  }, [cards, lastAction, sendMessage, peer]);

  useEffect(() => {
    if (!lastAction || !cardState.actionId) return;

    if (lastLoggedActionId.current === cardState.actionId) return;
    lastLoggedActionId.current = cardState.actionId;

    const description = CARD_ACTION_DESCRIPTIONS[lastAction];
    if (!description) return;

    const entry: ActionLogEntry = {
      playerId: peer?.id ?? "You",
      playerName: playerNameRef.current,
      action: description,
      cardsInHand: cards.length,
      timestamp: Date.now(),
    };

    addActionLogEntryRef.current(entry);

    if (peer?.id) {
      sendMessage({ type: "action-log", payload: entry });
    }
  }, [cardState.actionId, lastAction, cards.length, peer?.id, sendMessage]);

  // Keep card state local; do not broadcast deck/hand to peers

  useEffect(() => {
    if (!peer?.id) return;

    const sendHeartbeat = () => {
      const timestamp = Date.now();
      setPeerPresence((prev) => ({ ...prev, [peer.id]: timestamp }));
      setPeerNames((prev) => ({ ...prev, [peer.id]: playerNameRef.current }));
      sendMessage({
        type: "heartbeat",
        payload: { peerId: peer.id, timestamp, name: playerNameRef.current },
      });
    };

    sendHeartbeat();
    const intervalId = window.setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [peer?.id, sendMessage]);

  useEffect(() => {
    const unsubscribeShapes = onMessage("shapes", (message) => {
      setReceivedDataMap((prev) => ({
        ...prev,
        [message.payload.id]: message.payload.data,
      }));
    });

    const unsubscribeConnected = onMessage("connected", (message) => {
      toast(`Peer connected: ${message.payload.peerId}`);
      setPeerPresence((prev) => ({
        ...prev,
        [message.payload.peerId]: Date.now(),
      }));
      if (message.payload.name) {
        setPeerNames((prev) => ({
          ...prev,
          [message.payload.peerId]: message.payload.name,
        }));
      }

      if (peer?.id && message.payload.peerId && actionLogRef.current.length > 0) {
        sendMessage(
          {
            type: "action-log-snapshot",
            payload: { entries: actionLogRef.current.slice(-20) },
          },
          message.payload.peerId
        );
      }
    });

    const unsubscribeProuton = onMessage("prouton", () => {
      toast(`Prouton!`);
    });

    const unsubscribePlayersInfo = onMessage("playersInfo", () => { });

    const unsubscribeHeartbeat = onMessage("heartbeat", (message) => {
      setPeerPresence((prev) => ({
        ...prev,
        [message.payload.peerId]: message.payload.timestamp,
      }));
      if (message.payload.name) {
        setPeerNames((prev) => ({
          ...prev,
          [message.payload.peerId]: message.payload.name,
        }));
      }
    });

    const unsubscribeActionLog = onMessage("action-log", (message) => {
      const incoming = message.payload as ActionLogEntry;
      const entry = {
        ...incoming,
        timestamp: incoming.timestamp ?? Date.now(),
      };
      addActionLogEntryRef.current(entry);
    });

    const unsubscribeRandomEvent = onMessage("random-event", (message) => {
      const { type, result, playerName: name, peerId: fromPeerId, timestamp } = message.payload as {
        type: RandomEventType;
        result: string;
        playerName?: string;
        peerId?: string;
        timestamp?: number;
      };
      const entry: ActionLogEntry = {
        playerId: fromPeerId ?? "Peer",
        playerName: name,
        action: describeRandomEvent({ type, result }),
        cardsInHand: 0,
        timestamp: timestamp ?? Date.now(),
      };
      addActionLogEntryRef.current(entry);
    });

    const unsubscribeActionLogSnapshot = onMessage(
      "action-log-snapshot",
      (message) => {
        const { entries } = message.payload as { entries: ActionLogEntry[] };
        if (Array.isArray(entries) && entries.length > 0) {
          updateActionLogRef.current((prev) => {
            const merged = [...prev, ...entries].slice(-MAX_ACTION_LOG_ENTRIES);
            return merged;
          });
          entries.forEach((entry) => logActionToConsole(entry, "Action Snapshot"));
        }
      }
    );

    const unsubscribeCardState = onMessage("card-state", () => { });

    return () => {
      unsubscribeShapes();
      unsubscribeConnected();
      unsubscribeProuton();
      unsubscribePlayersInfo();
      unsubscribeHeartbeat();
      unsubscribeActionLog();
      unsubscribeActionLogSnapshot();
      unsubscribeRandomEvent();
      unsubscribeCardState();
    };
  }, [
    onMessage,
    peer?.id,
    sendMessage,
    setPeerNames,
    setPeerPresence,
  ]);

  useEffect(() => {
    setReceivedDataMap((prev) => {
      const next = { ...prev };
      let changed = false;

      Object.keys(next).forEach((peerId) => {
        if (!connections.has(peerId)) {
          delete next[peerId];
          changed = true;
        }
      });

      return changed ? next : prev;
    });
    setPeerPresence((prev) => {
      const next = { ...prev };
      let changed = false;

      Object.keys(next).forEach((peerId) => {
        if (!connections.has(peerId) && peerId !== peer?.id) {
          delete next[peerId];
          changed = true;
        }
      });

      return changed ? next : prev;
    });
    setPeerNames((prev) => {
      const next = { ...prev };
      let changed = false;

      Object.keys(next).forEach((peerId) => {
        if (!connections.has(peerId) && peerId !== peer?.id) {
          delete next[peerId];
          changed = true;
        }
      });

      return changed ? next : prev;
    });
  }, [connections, peer?.id]);

  useEffect(() => {
    sendMessage({ type: "cards", payload: cards.length });
    sendMessage({ type: "deck", payload: deck.length });
  }, [cards, deck, sendMessage]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (!isSetupComplete) return;
      if (document.body.classList.contains("modal-open")) return;
      // Ignore keyboard shortcuts when editing text
      if (editingText) return;
      const target = event.target;
      if (target instanceof HTMLElement) {
        const tagName = target.tagName;
        if (
          target.isContentEditable ||
          tagName === "INPUT" ||
          tagName === "TEXTAREA" ||
          tagName === "SELECT"
        ) {
          return;
        }
      }

      // Platform-aware Cmd/Ctrl key
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const cmdKey = isMac ? event.metaKey : event.ctrlKey;

      // Undo/Redo shortcuts
      if (cmdKey && event.key === 'z') {
        event.preventDefault();
        if (event.shiftKey) {
          redo(); // Cmd+Shift+Z or Ctrl+Shift+Z
        } else {
          undo(); // Cmd+Z or Ctrl+Z
        }
        return;
      }

      if (event.key === "Control") {
        setIsCommandPressed(true);
      } else if (event.key === " ") {
        event.preventDefault(); // Prevent page scroll
        setIsSpacePressed(true);
        document.body.style.cursor = "grab";
      } else if (event.key === "?" || event.key === "/") {
        // Toggle help panel
        setShowHelp((prev) => !prev);
      } else if (event.key === "+" || event.key === "=") {
        // Zoom in at center of screen with smooth increment
        const centerPoint = {
          x: window.innerWidth / 2,
          y: window.innerHeight / 2,
        };
        applyZoomStepRef.current([centerPoint.x, centerPoint.y], "in");
      } else if (event.key === "-" || event.key === "_") {
        // Zoom out at center of screen with smooth increment
        const centerPoint = {
          x: window.innerWidth / 2,
          y: window.innerHeight / 2,
        };
        applyZoomStepRef.current([centerPoint.x, centerPoint.y], "out");
      } else if ((event.key === "t" || event.key === "T") && !cmdKey) {
        // T = tap/untap selected cards
        if (selectedShapeIds.length > 0) {
          event.preventDefault();
          engageCardRef.current();
        }
      } else if ((event.key === "c" || event.key === "C") && !cmdKey) {
        // C = open counter controls for exactly one selected card
        if (selectedShapeIds.length === 1) {
          const selectedShape = shapes.find(s => s.id === selectedShapeIds[0]);
          if (selectedShape && selectedShape.type === "image") {
            event.preventDefault();
            setShowCounterControls(true);
          }
        }
      } else if ((event.key === "d" || event.key === "D") && !cmdKey) {
        // D = draw a card
        event.preventDefault();
        drawCardRef.current();
      } else if (event.key === "Escape") {
        // Escape = close counter controls
        if (showCounterControls) {
          event.preventDefault();
          setShowCounterControls(false);
        }
      } else if (
        event.key === "Backspace" &&
        selectedShapeIds.length > 0
      ) {
        setShapes((prevShapes) =>
          prevShapes.filter((shape) => !selectedShapeIds.includes(shape.id))
        );
        setSelectedShapeIds([]);
      }
    }

    function handleKeyUp(event: KeyboardEvent) {
      if (!isSetupComplete) return;
      if (document.body.classList.contains("modal-open")) return;
      if (event.key === "Control") {
        setIsCommandPressed(false);
      } else if (event.key === " ") {
        setIsSpacePressed(false);
        if (!isPanning) {
          document.body.style.cursor = "default";
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [
    editingText,
    selectedShapeIds,
    setShapes,
    setSelectedShapeIds,
    isPanning,
    undo,
    redo,
    showCounterControls,
    shapes,
    isSetupComplete,
  ]);

  useEffect(() => {
    if (error) {
      toast.error(error.message);
    }
  }, [error]);

  useEffect(() => {
    if (selectedHandCardId && !cards.find((card) => card.id === selectedHandCardId)) {
      setSelectedHandCardId(null);
    }
  }, [cards, selectedHandCardId]);

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
  const deckCardCount = deckNames.length;
  const deckStatus = deckError
    ? "Deck failed to load. Check card names."
    : deckCardCount > 0
      ? isDeckLoading
        ? `Loading ${deckCardCount} cards...`
        : `Deck ready: ${deckCardCount} cards`
      : "No deck selected";

  const renderShortcutSection = (section: ShortcutSection) => (
    <div key={section.title} style={{ marginBottom: "16px" }}>
      <h4 style={{ margin: "8px 0 6px", fontSize: "14px", color: "#aaa" }}>
        {section.title}
      </h4>
      <div style={{ marginLeft: "8px", lineHeight: "1.6" }}>
        {section.items.map((item) => (
          <div key={`${section.title}-${item}`}>- {item}</div>
        ))}
      </div>
    </div>
  );

  const gridBounds = useMemo(() => {
    if (!isGridVisible || viewportSize.width === 0 || viewportSize.height === 0) {
      return null;
    }
    const topLeft = screenToWorld([0, 0], camera);
    const bottomRight = screenToWorld(
      [viewportSize.width, viewportSize.height],
      camera
    );
    const minX = Math.min(topLeft[0], bottomRight[0]);
    const maxX = Math.max(topLeft[0], bottomRight[0]);
    const minY = Math.min(topLeft[1], bottomRight[1]);
    const maxY = Math.max(topLeft[1], bottomRight[1]);
    const startX = Math.floor(minX / GRID_SIZE) * GRID_SIZE;
    const startY = Math.floor(minY / GRID_SIZE) * GRID_SIZE;
    const endX = Math.ceil(maxX / GRID_SIZE) * GRID_SIZE;
    const endY = Math.ceil(maxY / GRID_SIZE) * GRID_SIZE;
    return {
      startX,
      startY,
      width: Math.max(endX - startX, GRID_SIZE),
      height: Math.max(endY - startY, GRID_SIZE),
    };
  }, [camera, isGridVisible, viewportSize]);

  if (!isSetupComplete) {
    return (
      <div className="setup-screen fixed inset-0 z-(--z-setup) flex items-center justify-center p-[clamp(16px,4vw,48px)] bg-[repeating-linear-gradient(45deg,#dcdcdc_0px,#dcdcdc_12px,#cfcfcf_12px,#cfcfcf_24px)] animate-[setup-fade_0.2s_ease-out]">
        <div className="setup-card win-panel w-[min(760px,92vw)] rounded-[6px] p-[clamp(16px,3vw,28px)] flex flex-col gap-4 animate-[setup-rise_0.25s_ease-out]">
          <div className="setup-header flex justify-between items-start gap-4">
            <div>
              <p className="setup-kicker m-0 mb-1.5 text-[10px] tracking-[0.24em] uppercase text-win-text-muted">Table Setup</p>
              <h1 className="setup-title m-0 text-[clamp(22px,3vw,30px)]">
                {setupStep === "deck"
                  ? "Select your deck"
                  : "Multiplayer (optional)"}
              </h1>
              <p className="setup-subtitle mt-1 text-[13px] text-win-text-muted max-w-[52ch]">
                {setupStep === "deck"
                  ? "Paste a decklist to load your cards. You can change it later."
                  : "Connect now or skip to start solo. You can still connect later from the sidebar."}
              </p>
            </div>
            <div className="setup-step-badge rounded bg-win-subtle px-3 py-1.5 text-[10px] tracking-[0.18em] uppercase text-win-text whitespace-nowrap">
              {setupStep === "deck" ? "Step 1 of 2" : "Step 2 of 2"}
            </div>
          </div>

          {setupStep === "deck" ? (
            <div className="setup-body flex flex-col gap-3">
              <label className="setup-label text-[11px] tracking-[0.12em] uppercase text-win-text-muted" htmlFor="setup-deck">
                Deck list
              </label>
              <textarea
                id="setup-deck"
                className="setup-textarea win-input w-full p-3 text-[13px] leading-[1.4] font-[inherit] min-h-[180px] resize-y shadow-none"
                value={deckDraft}
                onChange={(event) => {
                  setDeckDraft(event.target.value);
                  if (setupError) {
                    setSetupError(null);
                  }
                }}
                placeholder={`1 Legion Angel
3 Wedding Announcement
...`}
              />
              <div className="setup-meta flex justify-between text-xs text-win-text-muted">
                <span>
                  {deckDraftCount > 0
                    ? `${deckDraftCount} cards detected`
                    : "Paste one card per line"}
                </span>
                {setupError && <span className="setup-error text-xs text-win-danger">{setupError}</span>}
              </div>
              <div className="setup-actions flex gap-2.5 justify-end flex-wrap">
                <button
                  type="button"
                  className="setup-button ghost win-button rounded px-3.5 py-2 text-xs bg-win-header-bg"
                  onClick={handleUseSampleDeck}
                >
                  Use sample deck
                </button>
                <button
                  type="button"
                  className="setup-button primary win-button rounded px-3.5 py-2 text-xs bg-win-hover hover:bg-[#f5f5f5]"
                  onClick={handleDeckContinue}
                  disabled={deckDraftCount === 0}
                >
                  Continue
                </button>
              </div>
            </div>
          ) : (
            <div className="setup-body flex flex-col gap-3">
              <div className="setup-deck-summary flex items-center justify-between text-xs text-win-text-muted rounded bg-[#e0e0e0] border border-win-border-mid px-2.5 py-2">
                <span>Deck status</span>
                <span>{deckStatus}</span>
              </div>
              {deckError && (
                <div className="setup-error text-xs text-win-danger">
                  Deck failed to load. Check card names.
                </div>
              )}
              <div className="setup-grid grid grid-cols-[repeat(2,minmax(0,1fr))] gap-3">
                <div className="setup-panel win-bevel flex flex-col gap-2 rounded bg-win-bg-light p-2.5">
                  <label className="setup-label text-[11px] tracking-[0.12em] uppercase text-win-text-muted" htmlFor="setup-peer-id">
                    Friend&apos;s peer ID
                  </label>
                  <div className="setup-input-row flex gap-2.5 items-center">
                    <input
                      id="setup-peer-id"
                      className="setup-input win-input w-full p-3 text-[13px] leading-[1.4] shadow-none"
                      type="text"
                      value={setupPeerId}
                      onChange={(event) => setSetupPeerId(event.target.value)}
                      placeholder="Enter peer ID"
                    />
                    <button
                      type="button"
                      className="setup-button primary win-button rounded px-3.5 py-2 text-xs bg-win-hover hover:bg-[#f5f5f5]"
                      onClick={() => connectToPeer(setupPeerId.trim())}
                      disabled={!setupPeerId.trim()}
                    >
                      Connect
                    </button>
                  </div>
                  {connections.size > 0 && (
                    <div className="setup-status text-xs text-win-text-muted">
                      Connected to {connections.size} peer
                      {connections.size !== 1 ? "s" : ""}
                    </div>
                  )}
                  {error && <div className="setup-error text-xs text-win-danger">{error.message}</div>}
                </div>
                <div className="setup-panel win-bevel flex flex-col gap-2 rounded bg-win-bg-light p-2.5">
                  <label className="setup-label text-[11px] tracking-[0.12em] uppercase text-win-text-muted">Your ID</label>
                  <div className="setup-input-row flex gap-2.5 items-center">
                    <input
                      className="setup-input win-input w-full p-3 text-[13px] leading-[1.4] shadow-none"
                      type="text"
                      readOnly
                      value={peer?.id ?? "Generating ID..."}
                    />
                    <button
                      type="button"
                      className="setup-button ghost win-button rounded px-3.5 py-2 text-xs bg-win-header-bg"
                      onClick={handleCopyPeerId}
                      disabled={!peer?.id}
                    >
                      {setupCopied ? "Copied" : "Copy"}
                    </button>
                  </div>
                  <div className="setup-hint text-[11px] text-win-text-muted">
                    Share this ID so a friend can connect to you.
                  </div>
                </div>
              </div>
              <div className="setup-actions flex gap-2.5 justify-end flex-wrap">
                <button
                  type="button"
                  className="setup-button ghost win-button rounded px-3.5 py-2 text-xs bg-win-header-bg"
                  onClick={() => setSetupStep("deck")}
                >
                  Back
                </button>
                <button
                  type="button"
                  className="setup-button primary win-button rounded px-3.5 py-2 text-xs bg-win-hover hover:bg-[#f5f5f5]"
                  onClick={() => setIsSetupComplete(true)}
                  disabled={deckNames.length === 0}
                >
                  Enter table
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div>
      <ContextMenu
        onEngageDisengageCard={onEngageDisengageCard}
        onFlip={onFlip}
        sendBackToDeck={sendBackToDeck}
        copy={copy}
        sendBackToHand={sendBackToHand}
        sendCardToFront={sendCardToFront}
        sendCardToBack={sendCardToBack}
        increaseSrcIndex={increaseSrcIndex}
        onManageCounters={() => setShowCounterControls(true)}
        onClearCounters={clearCounters}
      >
        <svg
          className="canvas-surface bg-white shadow-none"
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
            {isGridVisible && gridBounds && (
              <g
                className="canvas-grid pointer-events-none"
                transform={`translate(${gridBounds.startX} ${gridBounds.startY})`}
                pointerEvents="none"
              >
                <Grid
                  width={gridBounds.width}
                  height={gridBounds.height}
                  gridSize={GRID_SIZE}
                  stroke="#6f5b3d"
                  opacity={0.25}
                />
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
                onToggleTap={onToggleTap}
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
              <g className="card-drop-preview" pointerEvents="none">
                <image
                  href={dragPreview.faceDown ? CARD_BACK_URL : dragPreview.src}
                  x={dragPreview.point[0]}
                  y={dragPreview.point[1]}
                  width={CARD_PREVIEW_SIZE[0]}
                  height={CARD_PREVIEW_SIZE[1]}
                />
                <rect
                  x={dragPreview.point[0]}
                  y={dragPreview.point[1]}
                  width={CARD_PREVIEW_SIZE[0]}
                  height={CARD_PREVIEW_SIZE[1]}
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
          onShuffleDeck={onShuffleDeck}
          cards={data}
          relatedCards={relatedCards}
          addCardToHand={addCardToHand}
          addToken={addToken}
          changeColor={changeColor}
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
          isGridVisible={isGridVisible}
          isSnapEnabled={isSnapEnabled}
          onToggleGrid={() => setIsGridVisible((prev) => !prev)}
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
        <div className="zoomed-card fixed top-2.5 right-2.5 h-[700px] border-2 border-black bg-white z-(--z-zoomed-card) shadow-[0_4px_8px_rgba(0,0,0,0.2)]" style={{ pointerEvents: "none" }}>
          <img src={hoveredCard} alt={`Zoomed ${hoveredCard}`} />
        </div>
      )}

      {/* Help button */}
      <button
        onClick={() => setShowHelp(!showHelp)}
        className="help-button fixed top-3 left-[calc(12px+clamp(200px,24vw,280px)+8px)] z-(--z-help-button) h-7 w-7 rounded-full border border-[#666] text-base font-bold cursor-pointer inline-flex items-center justify-center shadow-[0_2px_8px_rgba(0,0,0,0.2)]"
        style={{
          background: showHelp ? "#444" : "#fff",
          color: showHelp ? "#fff" : "#666",
        }}
        title="Show controls (Press ?). How to play: The rules of Magic stay the same - Maginet just gives you a shared virtual table."
      >
        ?
      </button>

      {!isMobile && isShortcutDockOpen ? (
        <div
          className="shortcut-dock win-panel fixed z-(--z-shortcut-dock) w-[280px] max-h-[calc(100vh-240px)] p-2.5 text-xs overflow-y-auto overflow-x-hidden"
          onPointerDown={(event) => event.stopPropagation()}
          onWheel={(event) => event.stopPropagation()}
        >
          <div className="shortcut-dock__header win-titlebar -mx-2.5 -mt-2.5 mb-2 flex items-center justify-between px-2 py-1.5 text-xs font-bold">
            <span>Shortcuts</span>
            <button
              type="button"
              className="shortcut-dock__close win-bevel inline-flex h-[18px] w-[18px] cursor-pointer items-center justify-center rounded-sm bg-win-button p-0 text-xs leading-none text-win-text hover:bg-win-hover active:win-bevel-pressed"
              onClick={() => setIsShortcutDockOpen(false)}
              aria-label="Hide shortcuts"
              title="Hide shortcuts"
            >
              ×
            </button>
          </div>
          <div className="shortcut-dock__content flex flex-col gap-2.5">
            {KEYBOARD_SHORTCUT_SECTIONS.map((section) => (
              <div key={section.title} className="shortcut-dock__section flex flex-col gap-1">
                <div className="shortcut-dock__title text-[11px] font-bold uppercase tracking-[0.03em]">{section.title}</div>
                <div className="shortcut-dock__items ml-2 flex flex-col gap-0.5 leading-[1.4]">
                  {section.items.map((item) => (
                    <div
                      key={`${section.title}-${item}`}
                      className="shortcut-dock__item text-[11px]"
                    >
                      - {item}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : !isMobile ? (
        <button
          type="button"
          className="shortcut-dock-toggle win-bevel-raised fixed z-(--z-shortcut-dock) rounded bg-win-button px-2.5 py-1.5 text-xs font-bold cursor-pointer font-win text-win-text hover:bg-win-hover"
          onClick={() => setIsShortcutDockOpen(true)}
        >
          Shortcuts
        </button>
      ) : null}

      {/* Help panel */}
      {showHelp && (
        <div
          className="help-dialog win-panel fixed top-[60px] left-5 z-(--z-help-dialog) max-w-[360px] max-h-[calc(100vh-120px)] overflow-y-auto p-3.5 pt-1.5 text-[13px]"
          onWheel={(e) => e.stopPropagation()}
        >
          <h3 className="help-dialog-title win-titlebar -mx-3.5 -mt-1.5 mb-2.5 px-2.5 py-1.5 text-[13px]">
            Canvas Controls
          </h3>

          {PRIMARY_HELP_SHORTCUT_SECTIONS.map(renderShortcutSection)}

          <div style={{ marginBottom: "16px" }}>
            <h4 style={{ margin: "8px 0 6px", fontSize: "14px", color: "#aaa" }}>
              Multiplayer
            </h4>
            <div style={{ marginLeft: "8px", lineHeight: "1.6" }}>
              - Copy your ID in Multiplayer (left sidebar) and share it<br />
              - Paste a friend's ID into the Multiplayer field<br />
              - Click Connect to sync boards<br />
            </div>
          </div>

          <div style={{ marginBottom: "16px" }}>
            <h4 style={{ margin: "8px 0 6px", fontSize: "14px", color: "#aaa" }}>
              Deck
            </h4>
            <div style={{ marginLeft: "8px", lineHeight: "1.6" }}>
              - In Deck (left sidebar)<br />
              - Click Select Deck<br />
              - Paste your decklist and click Submit<br />
            </div>
          </div>

          {OTHER_HELP_SHORTCUT_SECTION && renderShortcutSection(OTHER_HELP_SHORTCUT_SECTION)}

          <div style={{ marginBottom: "16px" }}>
            <h4 style={{ margin: "8px 0 6px", fontSize: "14px", color: "#aaa" }}>
              How to Play
            </h4>
            <div style={{ marginLeft: "8px", lineHeight: "1.6" }}>
              The rules of Magic stay the same - Maginet just gives you a shared
              virtual table.
            </div>
          </div>

          <button onClick={() => setShowHelp(false)} className="help-dialog-close win-button mt-3 w-full rounded-sm px-3 py-1.5 text-xs">
            Close
          </button>
        </div>
      )}

      {/* Counter Controls Panel */}
      {showCounterControls && selectedShapeIds.length === 1 && (() => {
        const selectedShape = shapes.find(s => s.id === selectedShapeIds[0]);
        return selectedShape && selectedShape.type === "image" ? (
          <CounterControls
            currentCounters={selectedShape.counters || []}
            onUpdateCounters={updateCounters}
            onClose={() => setShowCounterControls(false)}
          />
        ) : null;
      })()}

    </div>
  );
}

export default Canvas;

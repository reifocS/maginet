import * as React from "react";
import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { Handler, useGesture } from "@use-gesture/react";

import { Shape as ShapeComponent } from "./Shape";
import "./Canvas.css";
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
import "./Modal.css";
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
  PLAY_CARD: "played a card",
  ADD_TO_HAND: "searched a card",
  SHUFFLE_DECK: "shuffled the deck",
};

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
  const [showCounterControls, setShowCounterControls] = useState(false);
  const [selectedHandCardId, setSelectedHandCardId] = useState<string | null>(null);

  // Refs
  const ref = useRef<SVGSVGElement>(null);
  const rDragging = useRef<{ shape: Shape; origin: number[] } | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
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
    setShapes((prev) => [
      ...prev,
      {
        id: generateId(),
        type: "token",
        point: [center.x, center.y],
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

  const playCardAt = (
    cardId: string,
    clientX: number,
    clientY: number,
    playFaceDown = false
  ) => {
    const { x, y } = screenToCanvas({ x: clientX, y: clientY }, cameraRef.current);
    const card = cardStateRef.current.cards.find((c) => c.id === cardId);
    if (!card) return false;
    dispatch({ type: "PLAY_CARD", payload: [cardId] });
    setShapes((prevShapes) => [
      ...prevShapes,
      {
        id: generateId(),
        point: [x, y],
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

  // Event handlers
  const handleDrop = (e: React.DragEvent<SVGElement>) => {
    e.preventDefault();
    const cardId = e.dataTransfer.getData("text/plain");
    const playFaceDown = e.dataTransfer.getData("playFaceDown") === "true";
    playCardAt(cardId, e.clientX, e.clientY, playFaceDown);
  };

  function onPointerDownCanvas(e: React.PointerEvent<SVGElement>) {
    const { x, y } = screenToCanvas({ x: e.clientX, y: e.clientY }, camera);
    const point = [x, y];

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
            point,
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
        createShape(shapeType, point);
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
      updateShapeInCreation([x, y]);
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
          onEngageDisengageCard();
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
    onEngageDisengageCard,
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

  if (!isSetupComplete) {
    return (
      <div className="setup-screen">
        <div className="setup-card">
          <div className="setup-header">
            <div>
              <p className="setup-kicker">Table Setup</p>
              <h1 className="setup-title">
                {setupStep === "deck"
                  ? "Select your deck"
                  : "Multiplayer (optional)"}
              </h1>
              <p className="setup-subtitle">
                {setupStep === "deck"
                  ? "Paste a decklist to load your cards. You can change it later."
                  : "Connect now or skip to start solo. You can still connect later from the sidebar."}
              </p>
            </div>
            <div className="setup-step-badge">
              {setupStep === "deck" ? "Step 1 of 2" : "Step 2 of 2"}
            </div>
          </div>

          {setupStep === "deck" ? (
            <div className="setup-body">
              <label className="setup-label" htmlFor="setup-deck">
                Deck list
              </label>
              <textarea
                id="setup-deck"
                className="setup-textarea"
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
              <div className="setup-meta">
                <span>
                  {deckDraftCount > 0
                    ? `${deckDraftCount} cards detected`
                    : "Paste one card per line"}
                </span>
                {setupError && <span className="setup-error">{setupError}</span>}
              </div>
              <div className="setup-actions">
                <button
                  type="button"
                  className="setup-button ghost"
                  onClick={handleUseSampleDeck}
                >
                  Use sample deck
                </button>
                <button
                  type="button"
                  className="setup-button primary"
                  onClick={handleDeckContinue}
                  disabled={deckDraftCount === 0}
                >
                  Continue
                </button>
              </div>
            </div>
          ) : (
            <div className="setup-body">
              <div className="setup-deck-summary">
                <span>Deck status</span>
                <span>{deckStatus}</span>
              </div>
              {deckError && (
                <div className="setup-error">
                  Deck failed to load. Check card names.
                </div>
              )}
              <div className="setup-grid">
                <div className="setup-panel">
                  <label className="setup-label" htmlFor="setup-peer-id">
                    Friend&apos;s peer ID
                  </label>
                  <div className="setup-input-row">
                    <input
                      id="setup-peer-id"
                      className="setup-input"
                      type="text"
                      value={setupPeerId}
                      onChange={(event) => setSetupPeerId(event.target.value)}
                      placeholder="Enter peer ID"
                    />
                    <button
                      type="button"
                      className="setup-button primary"
                      onClick={() => connectToPeer(setupPeerId.trim())}
                      disabled={!setupPeerId.trim()}
                    >
                      Connect
                    </button>
                  </div>
                  {connections.size > 0 && (
                    <div className="setup-status">
                      Connected to {connections.size} peer
                      {connections.size !== 1 ? "s" : ""}
                    </div>
                  )}
                  {error && <div className="setup-error">{error.message}</div>}
                </div>
                <div className="setup-panel">
                  <label className="setup-label">Your ID</label>
                  <div className="setup-input-row">
                    <input
                      className="setup-input"
                      type="text"
                      readOnly
                      value={peer?.id ?? "Generating ID..."}
                    />
                    <button
                      type="button"
                      className="setup-button ghost"
                      onClick={handleCopyPeerId}
                      disabled={!peer?.id}
                    >
                      {setupCopied ? "Copied" : "Copy"}
                    </button>
                  </div>
                  <div className="setup-hint">
                    Share this ID so a friend can connect to you.
                  </div>
                </div>
              </div>
              <div className="setup-actions">
                <button
                  type="button"
                  className="setup-button ghost"
                  onClick={() => setSetupStep("deck")}
                >
                  Back
                </button>
                <button
                  type="button"
                  className="setup-button primary"
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
          className="canvas-surface"
          ref={ref}
          onPointerDownCapture={onPointerDownCaptureCanvas}
          onPointerMoveCapture={onPointerMoveCaptureCanvas}
          onPointerUpCapture={onPointerUpCaptureCanvas}
          onPointerCancelCapture={onPointerUpCaptureCanvas}
          onPointerDown={onPointerDownCanvas}
          onPointerMove={onPointerMoveCanvas}
          onPointerUp={onPointerUpCanvas}
          onPointerCancel={onPointerUpCanvas}
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
        >
          <g style={{ transform }}>
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
        />
      </div>

      <Hand
        cards={cards}
        setHoveredCard={setHoveredCard}
        selectedCardId={selectedHandCardId}
        onSelectCard={setSelectedHandCardId}
      />

      {/* Zoomed card preview */}
      {isCommandPressed && hoveredCard && (
        <div className="zoomed-card" style={{ pointerEvents: "none" }}>
          <img src={hoveredCard} alt={`Zoomed ${hoveredCard}`} />
        </div>
      )}

      {/* Help button */}
      <button
        onClick={() => setShowHelp(!showHelp)}
        className="help-button"
        style={{
          background: showHelp ? "#444" : "#fff",
          color: showHelp ? "#fff" : "#666",
        }}
        title="Show controls (Press ?). How to play: The rules of Magic stay the same - Maginet just gives you a shared virtual table."
      >
        ?
      </button>

      {/* Help panel */}
      {showHelp && (
        <div
          className="help-dialog"
          onWheel={(e) => e.stopPropagation()}
        >
          <h3 className="help-dialog-title">
            Canvas Controls
          </h3>

          <div style={{ marginBottom: "16px" }}>
            <h4 style={{ margin: "8px 0 6px", fontSize: "14px", color: "#aaa" }}>
              Panning
            </h4>
            <div style={{ marginLeft: "8px", lineHeight: "1.6" }}>
              - One-finger drag on empty canvas (touch)<br />
              - Two-finger drag (touch)<br />
              - Two-finger scroll (trackpad)<br />
              - Middle mouse button + drag<br />
              - Space + drag<br />
              - Alt + drag<br />
            </div>
          </div>

          <div style={{ marginBottom: "16px" }}>
            <h4 style={{ margin: "8px 0 6px", fontSize: "14px", color: "#aaa" }}>
              Zooming
            </h4>
            <div style={{ marginLeft: "8px", lineHeight: "1.6" }}>
              - Pinch (touch)<br />
              - Pinch gesture (trackpad)<br />
              - Ctrl + scroll wheel<br />
              - + / - keys<br />
            </div>
          </div>

          <div style={{ marginBottom: "16px" }}>
            <h4 style={{ margin: "8px 0 6px", fontSize: "14px", color: "#aaa" }}>
              Card Actions
            </h4>
            <div style={{ marginLeft: "8px", lineHeight: "1.6" }}>
              - T = tap/untap selected card<br />
              - C = manage counters on selected card<br />
              - Double-click = tap/untap<br />
              - Right-click = action menu<br />
              - Tap card in hand, then tap canvas to play (touch)<br />
              - Ctrl + hover = preview<br />
            </div>
          </div>

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

          <div style={{ marginBottom: "16px" }}>
            <h4 style={{ margin: "8px 0 6px", fontSize: "14px", color: "#aaa" }}>
              Other
            </h4>
            <div style={{ marginLeft: "8px", lineHeight: "1.6" }}>
              - Backspace = delete selected<br />
              - ? = toggle this help<br />
            </div>
          </div>

          <div style={{ marginBottom: "16px" }}>
            <h4 style={{ margin: "8px 0 6px", fontSize: "14px", color: "#aaa" }}>
              How to Play
            </h4>
            <div style={{ marginLeft: "8px", lineHeight: "1.6" }}>
              The rules of Magic stay the same - Maginet just gives you a shared
              virtual table.
            </div>
          </div>

          <button onClick={() => setShowHelp(false)} className="help-dialog-close">
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

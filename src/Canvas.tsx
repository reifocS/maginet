import * as React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import toast from "react-hot-toast";
import { Handler, useGesture } from "@use-gesture/react";

import { Shape as ShapeComponent } from "./Shape";
import Grid from "./Grid";
import { DOMVector, screenToCanvas } from "./utils/vec";
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
} from "./hooks/useCards";
import { generateId } from "./utils/math";
import { useCardReducer } from "./hooks/useCardReducer";
import { panCamera, screenToWorld } from "./utils/canvas_utils";
import { SelectionPanel } from "./SelectionPanel";
import inputs, { normalizeWheel } from "./inputs";
import { useShapeStore } from "./hooks/useShapeStore";
import { useCamera } from "./hooks/useCamera";
import { usePeerSync } from "./hooks/usePeerSync";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { useTouchGestures } from "./hooks/useTouchGestures";
import { useHandDrag } from "./hooks/useHandDrag";
import EditingTextShape from "./EditingTextShape";

import {
  Point,
  Card,
  Shape,
  ShapeType,
  Mode,
  intersect,
} from "./types/canvas";

import {
  HEARTBEAT_STALE_MS,
  GRID_SIZE,
  CARD_PREVIEW_SIZE,
  CARD_BACK_URL,
} from "./constants/game";

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

  // Refs
  const ref = useRef<SVGSVGElement>(null);
  const rDragging = useRef<{ shape: Shape; origin: number[] } | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const drawCardRef = useRef<() => void>(() => {});
  const engageCardRef = useRef<() => void>(() => {});
  const applyZoomStepRef = useRef(applyZoomStep);
  applyZoomStepRef.current = applyZoomStep;

  // Touch gestures
  const {
    touchPanRef,
    touchPlaceRef,
    touchGestureRef,
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
    rDragging,
  });

  // URL parameters
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const deckParam = params.get("deck") ?? "";

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
  const cardStateRef = useRef(cardState);

  useEffect(() => {
    cardStateRef.current = cardState;
  }, [cardState]);

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

  const snapPointToGrid = (point: [number, number]) => {
    if (!isSnapEnabled) return point;
    const [x, y] = point;
    const snappedX = Math.round(x / GRID_SIZE) * GRID_SIZE;
    const snappedY = Math.round(y / GRID_SIZE) * GRID_SIZE;
    return [snappedX, snappedY] as [number, number];
  };

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
    cardStateRef,
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
    if (data) {
      const initialDeck: Card[] = mapDataToCards(data);
      dispatch({ type: "INITIALIZE_DECK", payload: initialDeck });
      toast(`Deck initialized with ${initialDeck.length} cards`);
    }
  }, [data, dispatch]);


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

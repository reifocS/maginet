import * as React from "react";
import { Shape as ShapeComponent } from "./Shape";
import "./Canvas.css";
import { DOMVector, screenToCanvas } from "./utils/vec";
import Hand from "./Hand";
import ContextMenu from "./ContextMenu";
import useCards, {
  Datum,
  mapDataToCards,
  processRawText,
} from "./hooks/useCards";
import { useEffect } from "react";
import { usePeerStore } from "./hooks/usePeerConnection";
import toast from "react-hot-toast";
import { useLocation } from "react-router-dom";
import "./Modal.css";
import { generateId } from "./utils/math";
import { useCardReducer } from "./hooks/useCardReducer";
import { DEFAULT_DECK } from "./DEFAULT_DECK";
import { zoomCamera, panCamera } from "./utils/canvas_utils";
import { SelectionPanel } from "./SelectionPanel";
import inputs, { normalizeWheel } from "./inputs";
import { useGesture } from "@use-gesture/react";
import { useShapeStore } from "./hooks/useShapeStore";
import EditingTextShape from "./EditingTextShape";
// import ActionLog from "./ActionLog";

export interface Point {
  x: number;
  y: number;
}

export interface Card {
  id: string;
  src: string[];
}

export interface Camera {
  x: number;
  y: number;
  z: number;
}

export interface Shape {
  id: string;
  point: number[];
  size: number[];
  type: ShapeType;
  text?: string;
  src?: string[]; // some cards have multiple images (e.g. double faced cards)
  srcIndex: number; // index of the current image in the src array
  rotation?: number;
  isFlipped?: boolean;
  fontSize?: number;
  values?: [number, number];
  color?: string;
}

export type ShapeType =
  | "rectangle"
  | "circle"
  | "arrow"
  | "text"
  | "image"
  | "token";

export type Mode = "select" | "create";

function rotateShape(shape: Shape, angle: number): Shape {
  return {
    ...shape,
    rotation: (shape.rotation || 0) + angle,
  };
}
export const MAX_ZOOM_STEP = 5;

const playersColors = [
  "rgb(255, 0, 0, 0.5)",
  "rgb(0, 255, 0, 0.5)",
  "rgb(0, 0, 255, 0.5)",
  "rgb(255, 255, 0, 0.5)",
  "rgb(128, 0, 128, 0.5)",
  "rgb(255, 165, 0, 0.5)",
];
const getPlayerColor = (index: number) =>
  playersColors[index % playersColors.length];

function intersect(rect1: DOMRect, rect2: DOMRect) {
  if (rect1.right < rect2.left || rect2.right < rect1.left) return false;

  if (rect1.bottom < rect2.top || rect2.bottom < rect1.top) return false;

  return true;
}

export default function Canvas() {
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
  } = useShapeStore();

  const { initPeer, disconnect, sendMessage, onMessage, peer, error } =
    usePeerStore();
  const [isDragging, setIsDragging] = React.useState(false);
  const [dragVector, setDragVector] = React.useState<DOMVector | null>(null);
  const [camera, setCamera] = React.useState<Camera>({ x: 0, y: 0, z: 1 });
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const d = params.get("deck");
  const selectionRect =
    dragVector && isDragging ? dragVector.toDOMRect() : null;

  const { data } = useCards(
    Array.from(processRawText(d || DEFAULT_DECK.join("\n")))
  );

  // for related cards (i.e. cards that reference other cards)
  const allParts =
    data
      ?.filter((v) => v.all_parts && v.all_parts.length > 0)
      .flatMap((v) => v.all_parts) ?? [];

  const { data: relatedCards } = useCards(
    Array.from(
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
  );

  const [mode, setMode] = React.useState<Mode>("select");
  const [shapeType, setShapeType] = React.useState<ShapeType>("text");
  const [receivedDataMap, setReceivedDataMap] = React.useState<
    Record<string, Shape[]>
  >({});
  // const [receivedPlayersInfo, setReceivedPlayersInfo] = React.useState<
  //   Record<
  //     string,
  //     {
  //       cardsInHand: number;
  //       lastAction: string;
  //     }[]
  //   >
  // >({});

  const [hoveredCard, setHoveredCard] = React.useState<string | null>(null);
  const [isCommandPressed, setIsCommandPressed] = React.useState(false);
  const [cardState, dispatch] = useCardReducer({
    cards: [],
    deck: [],
  });
  const [mousePosition, setMousePosition] = React.useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = React.useState(false);
  const [lastPanPosition, setLastPanPosition] = React.useState<Point | null>(
    null
  );
  useGesture(
    {
      onWheel: ({ event, delta, ctrlKey }) => {
        event.preventDefault();
        if (ctrlKey) {
          const { point } = inputs.wheel(event as WheelEvent);
          const z = normalizeWheel(event)[2];
          setCamera((prev) => zoomCamera(prev, point, z * 0.618));
          return;
        } else {
          setCamera((camera) => panCamera(camera, delta[0], delta[1]));
        }
      },
    },
    {
      target: document.body,
      eventOptions: { passive: false },
    }
  );
  const { cards, deck, lastAction } = cardState;

  const ref = React.useRef<SVGSVGElement>(null);
  // for dragging shapes in the canvas
  const rDragging = React.useRef<{
    shape: Shape;
    origin: number[];
  } | null>(null);
  // for editing text in the canvas
  const inputRef = React.useRef<HTMLTextAreaElement>(null);

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

  const handleDrop = (e: React.DragEvent<SVGElement>) => {
    e.preventDefault();
    const cardId = e.dataTransfer.getData("text/plain");
    const { x, y } = screenToCanvas({ x: e.clientX, y: e.clientY }, camera);
    const card = cardState.cards.find((card) => card.id === cardId);
    if (!card) return;
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
      },
    ]);
  };

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

  function flipShape(shape: Shape): Shape {
    return {
      ...shape,
      isFlipped: !shape.isFlipped,
    };
  }
  function onFlip() {
    if (mode === "select" && selectedShapeIds.length > 0) {
      setShapes((prevShapes) =>
        prevShapes.map((shape) =>
          selectedShapeIds.includes(shape.id) ? flipShape(shape) : shape
        )
      );
    }
  }

  function onPointerDownCanvas(e: React.PointerEvent<SVGElement>) {
    const { x, y } = screenToCanvas({ x: e.clientX, y: e.clientY }, camera);
    const point = [x, y];
    if (e.button === 0 && e.altKey) {
      setIsPanning(true);
      setLastPanPosition({ x: e.clientX, y: e.clientY });
      e.currentTarget.setPointerCapture(e.pointerId);
      return;
    }
    if (mode === "create") {
      e.currentTarget.setPointerCapture(e.pointerId);
      if (shapeType === "text") {
        const id = generateId();
        setShapes([
          ...shapes,
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
    } else if (mode === "select" && !rDragging.current) {
      e.currentTarget.setPointerCapture(e.pointerId);
      setDragVector(new DOMVector(x, y, 0, 0));
    }
  }
  function onPointerMoveCanvas(e: React.PointerEvent<SVGElement>) {
    const { x, y } = screenToCanvas({ x: e.clientX, y: e.clientY }, camera);
    if (isPanning && lastPanPosition) {
      const dx = e.clientX - lastPanPosition.x;
      const dy = e.clientY - lastPanPosition.y;
      setCamera(panCamera(camera, -dx, -dy));
      setLastPanPosition({ x: e.clientX, y: e.clientY });
      return;
    }
    setMousePosition({ x, y });
    if (mode === "create" && shapeInCreation) {
      updateShapeInCreation([x, y]);
    } else if (mode === "select" && dragVector) {
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
        const shapeRect = new DOMRect(shapeX, shapeY, shapeWidth, shapeHeight);
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
    if (isPanning) {
      setIsPanning(false);
      setLastPanPosition(null);
      e.currentTarget.releasePointerCapture(e.pointerId);
      return;
    }
    if (mode === "create" && shapeInCreation) {
      e.currentTarget.releasePointerCapture(e.pointerId);

      setShapes((prevShapes) => [...prevShapes, shapeInCreation.shape]);
      setShapeInCreation(null);
      setMode("select");
    } else if (mode === "select") {
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
  function onEngageDisengageCard() {
    if (mode === "select" && selectedShapeIds.length > 0) {
      setShapes((prevShapes) =>
        prevShapes.map((shape) =>
          selectedShapeIds.includes(shape.id) && shape.type === "image"
            ? shape.rotation !== 0
              ? rotateShape(shape, -90)
              : rotateShape(shape, 90)
            : shape
        )
      );
    }
  }
  const updateDraggingRef = React.useCallback(
    (newRef: { shape: Shape; origin: number[] } | null) => {
      rDragging.current = newRef;
    },
    [rDragging]
  );
  const onShuffleDeck = () => {
    dispatch({ type: "SHUFFLE_DECK" });
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

  useEffect(() => {
    if (isPanning) {
      document.body.style.cursor = "grab";
    } else {
      document.body.style.cursor = "default";
    }
  }, [isPanning]);
  useEffect(() => {
    const unsubscribe = useShapeStore.subscribe((state) => {
      sendMessage({
        type: "shapes",
        payload: {
          id: peer?.id,
          data: state.shapes,
        },
      });
    });

    return () => {
      unsubscribe();
    };
  }, [sendMessage, peer]);

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
    const unsubscribeShapes = onMessage("shapes", (message) => {
      setReceivedDataMap((prev) => ({
        ...prev,
        [message.payload.id]: message.payload.data,
      }));
    });

    const unsubscribeConnected = onMessage("connected", (message) => {
      toast(`Peer connected: ${message.payload.peerId}`);
    });

    const unsubscribeProuton = onMessage("prouton", () => {
      toast(`Prouton!`);
    });

    const unsubscribePlayersInfo = onMessage("playersInfo", (message) => {
      toast(
        `Received ${message.payload.peerId} info: ${message.payload.data.lastAction}.
        ${message.payload.data.cardsInHand} cards in hand`
      );
      // setReceivedPlayersInfo((prev) => ({
      //   ...prev,
      //   [message.payload.peerId]: [
      //     ...(prev[message.payload.peerId] ?? []),
      //     message.payload.data,
      //   ],
      // }));
    });

    return () => {
      unsubscribeShapes();
      unsubscribeConnected();
      unsubscribeProuton();
      unsubscribePlayersInfo();
    };
  }, [onMessage, setShapes]);

  useEffect(() => {
    sendMessage({ type: "cards", payload: cards.length });
    sendMessage({ type: "deck", payload: deck.length });
  }, [cards, deck, sendMessage]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Control") {
        setIsCommandPressed(true);
      } else if (
        event.key === "Backspace" &&
        selectedShapeIds.length > 0 &&
        editingText === null
      ) {
        setShapes((prevShapes) =>
          prevShapes.filter((shape) => !selectedShapeIds.includes(shape.id))
        );
        setSelectedShapeIds([]);
      }
    }

    function handleKeyUp(event: KeyboardEvent) {
      if (event.key === "Control") {
        setIsCommandPressed(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [
    mousePosition,
    editingText,
    selectedShapeIds,
    setShapes,
    setSelectedShapeIds,
  ]);

  useEffect(() => {
    if (error) {
      toast.error(error.message);
    }
  }, [error]);

  const receivedData: (Shape & { color: string })[] = Object.values(
    receivedDataMap
  )
    .map((data, index) =>
      data.map((shape) => ({
        ...shape,
        color: getPlayerColor(index),
      }))
    )
    .flat();
  const others = receivedData;
  const transform = `scale(${camera.z}) translate(${camera.x}px, ${camera.y}px)`;
  const editingTextShape = shapes.find((shape) => shape.id === editingText?.id);

  const shapesFiltered = shapes.filter((shape) => shape.id !== editingText?.id);

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
      >
        <svg
          ref={ref}
          onPointerDown={onPointerDownCanvas}
          onPointerMove={onPointerMoveCanvas}
          onPointerUp={onPointerUpCanvas}
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
        >
          <g style={{ transform }}>
            <text
              x={window.innerWidth / 2 - 100}
              y={200}
              style={{
                fontSize: "20px",
                userSelect: "none",
                fontFamily: "cursive",
                cursor: "pointer",
              }}
              width={100}
              height={100}
            >
              Maginet - pire to pire edition
            </text>

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
              />
            ))}

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
                updateDraggingRef={() => {}}
                selected={selectedShapeIds.includes(shape.id)}
              />
            ))}
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
        />
      </div>
      <Hand cards={cards} setHoveredCard={setHoveredCard} />
      {isCommandPressed && hoveredCard && (
        <div className="zoomed-card" style={{ pointerEvents: "none" }}>
          <img src={hoveredCard} alt={`Zoomed ${hoveredCard}`} />
        </div>
      )}
      {/* <ActionLog
        actions={Object.entries(receivedPlayersInfo)
          .map(([playerId, info]) =>
            info.map((action) => ({
              playerId,
              action: action.lastAction,
              cardsInHand: action.cardsInHand,
            }))
          )
          .flat()}
      ></ActionLog> */}
    </div>
  );
}

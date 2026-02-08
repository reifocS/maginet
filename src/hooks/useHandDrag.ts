import { useEffect, useRef, useState } from "react";
import type { Camera, Card, Shape } from "../types/canvas";
import type { DragCardMeta, HandDragState, DragPreview } from "../types/canvas";
import type { CardAction, CardState } from "./useCardReducer";
import { screenToCanvas } from "../utils/vec";
import { generateId } from "../utils/math";

interface UseHandDragOptions {
  svgRef: React.RefObject<SVGSVGElement | null>;
  cameraRef: React.RefObject<Camera>;
  cardStateRef: React.RefObject<CardState>;
  snapPointToGrid: (point: [number, number]) => [number, number];
  dispatch: React.Dispatch<CardAction>;
  setShapes: (shapes: Shape[] | ((shapes: Shape[]) => Shape[])) => void;
  cards: Card[];
}

export function useHandDrag({
  svgRef,
  cameraRef,
  cardStateRef,
  snapPointToGrid,
  dispatch,
  setShapes,
  cards,
}: UseHandDragOptions) {
  const [selectedHandCardId, setSelectedHandCardId] = useState<string | null>(null);
  const [dragPreview, setDragPreview] = useState<DragPreview | null>(null);
  const [draggingHandCardId, setDraggingHandCardId] = useState<string | null>(null);
  const [handDrag, setHandDrag] = useState<HandDragState | null>(null);

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
    const svg = svgRef.current;
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
    const rect = svgRef.current?.getBoundingClientRect();
    const clientX = rect ? rect.left + rect.width / 2 : window.innerWidth / 2;
    const clientY = rect ? rect.top + rect.height / 2 : window.innerHeight / 2;
    playCardAt(cardId, clientX, clientY, faceDown);
  };

  // Update refs
  playCardAtRef.current = playCardAt;
  updateDragPreviewAtRef.current = updateDragPreviewAt;
  isPointerOverCanvasRef.current = isPointerOverCanvas;
  resetHandDragStateRef.current = resetHandDragState;

  // Body class for hand dragging
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

  // Global pointer listener for hand drag
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

  // Cleanup selected hand card if it's no longer in hand
  useEffect(() => {
    if (selectedHandCardId && !cards.find((card) => card.id === selectedHandCardId)) {
      setSelectedHandCardId(null);
    }
  }, [cards, selectedHandCardId]);

  return {
    handDrag,
    dragPreview,
    draggingHandCardId,
    selectedHandCardId,
    setSelectedHandCardId,
    handleHandDragStart,
    playCardAt,
    playHandCardFromMenu,
  };
}

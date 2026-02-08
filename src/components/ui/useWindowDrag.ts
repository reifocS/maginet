import * as React from "react";

type DragOffset = {
  x: number;
  y: number;
};

type ActiveDrag = {
  pointerId: number;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
};

const isInteractiveElement = (target: EventTarget | null) =>
  target instanceof Element &&
  Boolean(
    target.closest(
      "button,input,textarea,select,a,label,[role='button'],[data-drag-ignore='true']"
    )
  );

export default function useWindowDrag({
  resetKey,
}: {
  resetKey?: string;
} = {}) {
  const [dragOffset, setDragOffset] = React.useState<DragOffset>({
    x: 0,
    y: 0,
  });
  const [isDragging, setIsDragging] = React.useState(false);
  const activeDragRef = React.useRef<ActiveDrag | null>(null);

  React.useEffect(() => {
    if (resetKey === undefined) return;
    setDragOffset({ x: 0, y: 0 });
    setIsDragging(false);
    activeDragRef.current = null;
  }, [resetKey]);

  const onDragHandlePointerDown = React.useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      if (event.button !== 0 && event.pointerType === "mouse") {
        return;
      }
      if (isInteractiveElement(event.target)) {
        return;
      }
      event.preventDefault();
      activeDragRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        originX: dragOffset.x,
        originY: dragOffset.y,
      };
      setIsDragging(true);
      if (event.currentTarget.setPointerCapture) {
        try {
          event.currentTarget.setPointerCapture(event.pointerId);
        } catch {
          // Ignore if pointer capture is unavailable.
        }
      }
    },
    [dragOffset.x, dragOffset.y]
  );

  React.useEffect(() => {
    if (!isDragging) return;

    const onPointerMove = (event: PointerEvent) => {
      const activeDrag = activeDragRef.current;
      if (!activeDrag || event.pointerId !== activeDrag.pointerId) return;
      event.preventDefault();
      setDragOffset({
        x: activeDrag.originX + (event.clientX - activeDrag.startX),
        y: activeDrag.originY + (event.clientY - activeDrag.startY),
      });
    };

    const onPointerUp = (event: PointerEvent) => {
      const activeDrag = activeDragRef.current;
      if (!activeDrag || event.pointerId !== activeDrag.pointerId) return;
      activeDragRef.current = null;
      setIsDragging(false);
    };

    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.cursor = "grabbing";
    document.body.style.userSelect = "none";

    window.addEventListener("pointermove", onPointerMove, { passive: false });
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);

    return () => {
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
    };
  }, [isDragging]);

  return {
    dragOffset,
    isDragging,
    onDragHandlePointerDown,
  };
}

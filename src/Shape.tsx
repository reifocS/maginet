import { useRef, useState } from "react";
import { Camera, Mode, Shape as ShapeType } from "./Canvas";
import { screenToCanvas } from "./utils/vec";
import vec from "./utils/vec";
import { useShapeStore } from "./hooks/useShapeStore";
import ShapeFactory from "./components/ShapeFactory";

export function Shape({
  shape,
  rDragging,
  mode,
  setHoveredCard,
  inputRef,
  updateDraggingRef,
  readOnly,
  selected,
  camera,
  stackIndex = 0,
}: {
  shape: ShapeType;
  mode: Mode;
  rDragging: React.MutableRefObject<{
    shape: ShapeType;
    origin: number[];
  } | null>;
  camera: Camera;
  color?: string;
  setHoveredCard: React.Dispatch<React.SetStateAction<string | null>>;
  inputRef: React.RefObject<HTMLInputElement>;
  updateDraggingRef: (
    newRef: { shape: ShapeType; origin: number[] } | null
  ) => void;
  readOnly: boolean;
  selected: boolean;
  stackIndex?: number;
}) {
  const draggingShapeRefs = useRef<Record<string, ShapeType>>({});
  const [initialPointerPosition, setInitialPointerPosition] = useState<
    number[] | null
  >(null);
  const [isDragging, setIsDragging] = useState(false);
  const DRAG_THRESHOLD = 2;

  const {
    setShapes,
    setSelectedShapeIds,
    selectedShapeIds,
    shapes,
    setEditingText,
  } = useShapeStore();

  const updateSelection = (shapeId: string) =>
    selectedShapeIds.includes(shapeId) ? selectedShapeIds : [shapeId];

  const updateDraggingShapeRefs = (localSelectedShapeIds: string[]) => {
    draggingShapeRefs.current =
      localSelectedShapeIds.length === 1
        ? {}
        : Object.fromEntries(
            localSelectedShapeIds.map((id) => [
              id,
              shapes.find((s) => s.id === id)!,
            ])
          );
  };

  const onPointerDown = (e: React.PointerEvent<SVGElement>) => {
    if (mode !== "select" || readOnly) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    e.stopPropagation();

    const { x, y } = screenToCanvas({ x: e.clientX, y: e.clientY }, camera);
    setInitialPointerPosition([x, y]);

    const point = [x, y];

    const localSelectedShapeIds = updateSelection(shape.id);
    const id = e.currentTarget.id;
    const currentShape = shapes.find((s) => s.id === id)!;
    updateDraggingRef({
      shape: currentShape,
      origin: point,
    });
    updateDraggingShapeRefs(localSelectedShapeIds);
    setSelectedShapeIds(localSelectedShapeIds);
  };

  const onPointerMove = (e: React.PointerEvent<SVGElement>) => {
    if (mode !== "select" || readOnly || !rDragging.current) return;

    const { x, y } = screenToCanvas({ x: e.clientX, y: e.clientY }, camera);
    const point = [x, y];

    if (initialPointerPosition) {
      const [initialX, initialY] = initialPointerPosition;
      const distance = Math.sqrt((x - initialX) ** 2 + (y - initialY) ** 2);

      if (!isDragging && distance > DRAG_THRESHOLD) {
        setIsDragging(true);
      }
    }

    if (isDragging) {
      const delta = vec.sub(point, rDragging.current.origin);

      setShapes((prevShapes) =>
        prevShapes.map((s) =>
          s.id === rDragging.current?.shape.id
            ? { ...s, point: vec.add(rDragging.current.shape.point, delta) }
            : draggingShapeRefs.current[s.id]
            ? {
                ...s,
                point: vec.add(draggingShapeRefs.current[s.id].point, delta),
              }
            : s
        )
      );
    }
  };

  const onPointerUp = (e: React.PointerEvent<SVGElement>) => {
    e.currentTarget.releasePointerCapture(e.pointerId);
    e.stopPropagation();
    updateDraggingRef(null);
    draggingShapeRefs.current = {};
    setInitialPointerPosition(null);
    setIsDragging(false);
  };

  const handleClick = (e: React.MouseEvent<SVGElement>) => {
    if (readOnly) return;
    e.stopPropagation();
    if (e.shiftKey) {
      setShapes((prevShapes) =>
        prevShapes.map((s) =>
          s.id === shape.id
            ? {
                ...s,
                rotation: s.rotation && s.rotation > 0 ? 0 : 90,
              }
            : s
        )
      );
    }
  };

  const commonProps = {
    id: shape.id,
    onPointerDown: readOnly ? undefined : onPointerDown,
    onPointerMove: readOnly ? undefined : onPointerMove,
    onPointerLeave: readOnly ? undefined : onPointerUp,
    onPointerUp: readOnly ? undefined : onPointerUp,
    onClick: handleClick,
    style: {
      cursor: readOnly ? "default" : "move",
      filter: selected ? "url(#glow)" : "none",
    },
  };

  return (
    <>
      <defs>
        <filter id="glow">
          <feGaussianBlur stdDeviation="3" result="coloredBlur" />
          <feMerge>
            <feMergeNode in="coloredBlur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <ShapeFactory
        shape={shape}
        commonProps={commonProps}
        selected={selected}
        readOnly={readOnly}
        setEditingText={setEditingText}
        inputRef={inputRef}
        setHoveredCard={setHoveredCard}
        stackIndex={stackIndex}
      />
    </>
  );
}

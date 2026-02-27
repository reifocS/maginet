import { useRef } from "react";
import { Camera, Mode, Shape as ShapeType } from "../types/canvas";
import { screenToCanvas } from "../utils/vec";
import vec from "../utils/vec";
import { useShapeStore } from "../hooks/useShapeStore";
import ShapeFactory from "./components/ShapeFactory";
import { SelectionBox } from "./components/SelectionBox";

export function Shape({
  shape,
  rDragging,
  mode,
  setHoveredCard,
  inputRef,
  updateDraggingRef,
  readOnly,
  selected,
  zoom,
  cameraRef,
  stackIndex = 0,
  onToggleTap,
  snapToGrid,
}: {
  shape: ShapeType;
  mode: Mode;
  rDragging: React.MutableRefObject<{
    shape: ShapeType;
    origin: number[];
  } | null>;
  zoom: number;
  cameraRef: React.RefObject<Camera>;
  color?: string;
  setHoveredCard: React.Dispatch<React.SetStateAction<string | null>>;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  updateDraggingRef: (
    newRef: { shape: ShapeType; origin: number[] } | null
  ) => void;
  readOnly: boolean;
  selected: boolean;
  stackIndex?: number;
  onToggleTap?: (shapeId: string) => void;
  snapToGrid: (
    point: [number, number],
    context?: {
      movingShape: ShapeType;
      excludeIds?: string[];
      movingShapes?: ShapeType[];
      dragDelta?: [number, number];
    }
  ) => [number, number];
}) {
  const draggingShapeRefs = useRef<Record<string, ShapeType>>({});

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
    if (mode !== "select" || readOnly || !cameraRef.current) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    e.stopPropagation();

    const { x, y } = screenToCanvas({ x: e.clientX, y: e.clientY }, cameraRef.current);

    const point = [x, y];

    const localSelectedShapeIds = updateSelection(shape.id);
    const id = e.currentTarget.id;

    // Save history before drag starts
    const store = useShapeStore.getState();
    store.pushHistory();
    useShapeStore.setState({ isDraggingShape: true });

    updateDraggingRef({
      shape: shapes.find((s) => s.id === id)!,
      origin: point,
    });
    updateDraggingShapeRefs(localSelectedShapeIds);
    setSelectedShapeIds(localSelectedShapeIds);
  };

  const onPointerMove = (e: React.PointerEvent<SVGElement>) => {
    if (mode !== "select" || readOnly || !rDragging.current || !cameraRef.current) return;

    const { x, y } = screenToCanvas({ x: e.clientX, y: e.clientY }, cameraRef.current);
    const point = [x, y];
    const delta = vec.sub(point, rDragging.current.origin);
    const rawPoint = vec.add(rDragging.current.shape.point, delta) as [number, number];
    const movingShapeIds = selectedShapeIds.includes(shape.id)
      ? selectedShapeIds
      : [shape.id];
    const movingShapes =
      movingShapeIds.length > 1
        ? movingShapeIds
          .map((id) => draggingShapeRefs.current[id] ?? null)
          .filter((candidate): candidate is ShapeType => candidate !== null)
        : undefined;
    const snappedPoint = snapToGrid(rawPoint, {
      movingShape: rDragging.current.shape,
      excludeIds: movingShapeIds,
      movingShapes,
      dragDelta: delta as [number, number],
    });
    const snappedDelta = vec.sub(snappedPoint, rDragging.current.shape.point);

    setShapes((prevShapes) =>
      prevShapes.map((s) =>
        s.id === rDragging.current?.shape.id
          ? { ...s, point: vec.add(rDragging.current!.shape.point, snappedDelta) }
          : draggingShapeRefs.current[s.id]
            ? {
              ...s,
              point: vec.add(draggingShapeRefs.current[s.id].point, snappedDelta),
            }
            : s
      )
    );
  };

  const onPointerUp = (e: React.PointerEvent<SVGElement>) => {
    e.currentTarget.releasePointerCapture(e.pointerId);
    e.stopPropagation();
    updateDraggingRef(null);
    draggingShapeRefs.current = {};

    // Clear dragging flag
    useShapeStore.setState({ isDraggingShape: false });
  };

  const handleClick = (e: React.MouseEvent<SVGElement>) => {
    if (readOnly) return;
    e.stopPropagation();
  };


  const commonProps = {
    id: shape.id,
    onPointerDown: readOnly ? undefined : onPointerDown,
    onPointerMove: readOnly ? undefined : onPointerMove,
    onPointerUp: readOnly ? undefined : onPointerUp,
    onClick: handleClick,
    style: {
      cursor: readOnly ? "default" : "move",
    },
  };

  const handleResize = (
    newSize: [number, number],
    newPoint: [number, number],
    newFontSize?: number
  ) => {
    setShapes((prevShapes) =>
      prevShapes.map((s) =>
        s.id === shape.id
          ? {
            ...s,
            size: newSize,
            point: newPoint,
            fontSize:
              newFontSize && s.type === "text" ? newFontSize : s.fontSize,
          }
          : s
      )
    );
  };

  const handleRotate = (newRotation: number) => {
    setShapes((prevShapes) =>
      prevShapes.map((s) =>
        s.id === shape.id ? { ...shape, rotation: newRotation } : s
      )
    );
  };

  return (
    <>
      <ShapeFactory
        shape={shape}
        commonProps={commonProps}
        selected={selected}
        readOnly={readOnly}
        setEditingText={setEditingText}
        inputRef={inputRef}
        setHoveredCard={setHoveredCard}
        stackIndex={stackIndex}
        onToggleTap={onToggleTap}
      />
      {selected && !readOnly && (
        <SelectionBox
          shape={shape}
          zoom={zoom}
          onResize={handleResize}
          onRotate={handleRotate}
        />
      )}
    </>
  );
}

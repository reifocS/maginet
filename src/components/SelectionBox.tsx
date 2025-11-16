import React, { useState } from "react";
import { Shape as ShapeType, Camera } from "../types/canvas";
import { screenToCanvas } from "../utils/vec";

type HandleType = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "rotate";

interface SelectionBoxProps {
  shape: ShapeType;
  camera: Camera;
  onResize: (newSize: [number, number], newPoint: [number, number]) => void;
  onRotate: (newRotation: number) => void;
}

const HANDLE_SIZE = 8;
const ROTATION_HANDLE_OFFSET = 30;

export function SelectionBox({
  shape,
  camera,
  onResize,
  onRotate,
}: SelectionBoxProps) {
  const [draggingHandle, setDraggingHandle] = useState<HandleType | null>(null);
  const [dragStartPos, setDragStartPos] = useState<[number, number] | null>(
    null
  );
  const [originalShape, setOriginalShape] = useState<ShapeType | null>(null);

  const { point, size, rotation = 0 } = shape;
  const [x, y] = point;
  const [width, height] = size;

  // Calculate center point for rotation
  const centerX = x + width / 2;
  const centerY = y + height / 2;

  // Handle positions (before rotation)
  const handles: Record<HandleType, [number, number]> = {
    nw: [x, y],
    n: [x + width / 2, y],
    ne: [x + width, y],
    e: [x + width, y + height / 2],
    se: [x + width, y + height],
    s: [x + width / 2, y + height],
    sw: [x, y + height],
    w: [x, y + height / 2],
    rotate: [x + width / 2, y - ROTATION_HANDLE_OFFSET],
  };

  // Cursor styles for each handle
  const cursors: Record<HandleType, string> = {
    nw: "nw-resize",
    n: "n-resize",
    ne: "ne-resize",
    e: "e-resize",
    se: "se-resize",
    s: "s-resize",
    sw: "sw-resize",
    w: "w-resize",
    rotate: "grab",
  };

  const handlePointerDown = (
    e: React.PointerEvent<SVGCircleElement>,
    handle: HandleType
  ) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);

    const { x, y } = screenToCanvas({ x: e.clientX, y: e.clientY }, camera);
    setDraggingHandle(handle);
    setDragStartPos([x, y]);
    setOriginalShape({ ...shape });
  };

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!draggingHandle || !dragStartPos || !originalShape) return;

    const { x: mouseX, y: mouseY } = screenToCanvas(
      { x: e.clientX, y: e.clientY },
      camera
    );

    if (draggingHandle === "rotate") {
      // Calculate rotation angle
      const dx = mouseX - centerX;
      const dy = mouseY - centerY;
      const angle = (Math.atan2(dy, dx) * 180) / Math.PI + 90; // +90 to make 0 degrees point up
      onRotate(angle);
    } else {
      // Calculate resize
      const [origX, origY] = originalShape.point;
      const [origWidth, origHeight] = originalShape.size;
      const deltaX = mouseX - dragStartPos[0];
      const deltaY = mouseY - dragStartPos[1];

      let newX = origX;
      let newY = origY;
      let newWidth = origWidth;
      let newHeight = origHeight;

      // Apply resize based on which handle is being dragged
      switch (draggingHandle) {
        case "nw":
          newX = origX + deltaX;
          newY = origY + deltaY;
          newWidth = origWidth - deltaX;
          newHeight = origHeight - deltaY;
          break;
        case "n":
          newY = origY + deltaY;
          newHeight = origHeight - deltaY;
          break;
        case "ne":
          newY = origY + deltaY;
          newWidth = origWidth + deltaX;
          newHeight = origHeight - deltaY;
          break;
        case "e":
          newWidth = origWidth + deltaX;
          break;
        case "se":
          newWidth = origWidth + deltaX;
          newHeight = origHeight + deltaY;
          break;
        case "s":
          newHeight = origHeight + deltaY;
          break;
        case "sw":
          newX = origX + deltaX;
          newWidth = origWidth - deltaX;
          newHeight = origHeight + deltaY;
          break;
        case "w":
          newX = origX + deltaX;
          newWidth = origWidth - deltaX;
          break;
      }

      // Ensure minimum size
      if (newWidth < 10) {
        newWidth = 10;
        newX = origX;
      }
      if (newHeight < 10) {
        newHeight = 10;
        newY = origY;
      }

      onResize([newWidth, newHeight], [newX, newY]);
    }
  };

  const handlePointerUp = (e: React.PointerEvent<SVGCircleElement>) => {
    e.currentTarget.releasePointerCapture(e.pointerId);
    setDraggingHandle(null);
    setDragStartPos(null);
    setOriginalShape(null);
  };

  // Apply rotation transform to handle positions
  const rotatePoint = (px: number, py: number): [number, number] => {
    if (rotation === 0) return [px, py];

    const angle = (rotation * Math.PI) / 180;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    // Translate to origin
    const dx = px - centerX;
    const dy = py - centerY;

    // Rotate
    const rotatedX = dx * cos - dy * sin;
    const rotatedY = dx * sin + dy * cos;

    // Translate back
    return [rotatedX + centerX, rotatedY + centerY];
  };

  return (
    <g onPointerMove={handlePointerMove}>
      {/* Selection rectangle */}
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        fill="none"
        stroke="#4A90E2"
        strokeWidth={2 / camera.z}
        strokeDasharray={`${5 / camera.z},${5 / camera.z}`}
        pointerEvents="none"
        transform={`rotate(${rotation} ${centerX} ${centerY})`}
      />

      {/* Resize handles */}
      {(Object.entries(handles) as [HandleType, [number, number]][])
        .filter(([type]) => type !== "rotate")
        .map(([type, [hx, hy]]) => {
          const [rotatedX, rotatedY] = rotatePoint(hx, hy);
          return (
            <circle
              key={type}
              cx={rotatedX}
              cy={rotatedY}
              r={HANDLE_SIZE / camera.z}
              fill="white"
              stroke="#4A90E2"
              strokeWidth={2 / camera.z}
              style={{ cursor: cursors[type] }}
              onPointerDown={(e) => handlePointerDown(e, type)}
              onPointerUp={handlePointerUp}
            />
          );
        })}

      {/* Rotation handle with connecting line */}
      <g>
        <line
          x1={centerX}
          y1={y}
          x2={handles.rotate[0]}
          y2={handles.rotate[1]}
          stroke="#4A90E2"
          strokeWidth={2 / camera.z}
          strokeDasharray={`${3 / camera.z},${3 / camera.z}`}
          pointerEvents="none"
          transform={`rotate(${rotation} ${centerX} ${centerY})`}
        />
        {(() => {
          const [rotatedX, rotatedY] = rotatePoint(
            handles.rotate[0],
            handles.rotate[1]
          );
          return (
            <circle
              cx={rotatedX}
              cy={rotatedY}
              r={HANDLE_SIZE / camera.z}
              fill="#4A90E2"
              stroke="white"
              strokeWidth={2 / camera.z}
              style={{ cursor: cursors.rotate }}
              onPointerDown={(e) => handlePointerDown(e, "rotate")}
              onPointerUp={handlePointerUp}
            />
          );
        })()}
      </g>
    </g>
  );
}

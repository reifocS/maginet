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
      // Calculate resize with rotation support - keeping anchor corner fixed
      const [origX, origY] = originalShape.point;
      const [origWidth, origHeight] = originalShape.size;
      const origRotation = originalShape.rotation || 0;

      // Calculate delta in screen space
      const screenDeltaX = mouseX - dragStartPos[0];
      const screenDeltaY = mouseY - dragStartPos[1];

      // Transform delta into shape's local (rotated) coordinate space
      const angleRad = (-origRotation * Math.PI) / 180;
      const cos = Math.cos(angleRad);
      const sin = Math.sin(angleRad);
      const localDeltaX = screenDeltaX * cos - screenDeltaY * sin;
      const localDeltaY = screenDeltaX * sin + screenDeltaY * cos;

      // Step 1: Calculate anchor corner position in local space (opposite of dragged handle)
      let anchorLocalX = 0;
      let anchorLocalY = 0;
      switch (draggingHandle) {
        case "nw":
          anchorLocalX = origWidth;
          anchorLocalY = origHeight;
          break; // SE anchor
        case "n":
          anchorLocalX = origWidth / 2;
          anchorLocalY = origHeight;
          break; // S anchor
        case "ne":
          anchorLocalX = 0;
          anchorLocalY = origHeight;
          break; // SW anchor
        case "e":
          anchorLocalX = 0;
          anchorLocalY = origHeight / 2;
          break; // W anchor
        case "se":
          anchorLocalX = 0;
          anchorLocalY = 0;
          break; // NW anchor
        case "s":
          anchorLocalX = origWidth / 2;
          anchorLocalY = 0;
          break; // N anchor
        case "sw":
          anchorLocalX = origWidth;
          anchorLocalY = 0;
          break; // NE anchor
        case "w":
          anchorLocalX = origWidth;
          anchorLocalY = origHeight / 2;
          break; // E anchor
      }

      // Step 2: Calculate anchor's position in screen space (after rotation)
      const origCenterX = origX + origWidth / 2;
      const origCenterY = origY + origHeight / 2;
      const [anchorScreenX, anchorScreenY] = rotatePointAround(
        origX + anchorLocalX,
        origY + anchorLocalY,
        origRotation,
        origCenterX,
        origCenterY
      );

      // Step 3: Calculate new size based on local deltas
      let newWidth = origWidth;
      let newHeight = origHeight;

      switch (draggingHandle) {
        case "nw":
        case "w":
        case "sw":
          newWidth = origWidth - localDeltaX;
          break;
        case "ne":
        case "e":
        case "se":
          newWidth = origWidth + localDeltaX;
          break;
      }

      switch (draggingHandle) {
        case "nw":
        case "n":
        case "ne":
          newHeight = origHeight - localDeltaY;
          break;
        case "sw":
        case "s":
        case "se":
          newHeight = origHeight + localDeltaY;
          break;
      }

      // Ensure minimum size
      if (newWidth < 10) newWidth = 10;
      if (newHeight < 10) newHeight = 10;

      // Step 4: Calculate new anchor position in new shape's local space
      let newAnchorLocalX = 0;
      let newAnchorLocalY = 0;
      switch (draggingHandle) {
        case "nw":
          newAnchorLocalX = newWidth;
          newAnchorLocalY = newHeight;
          break;
        case "n":
          newAnchorLocalX = newWidth / 2;
          newAnchorLocalY = newHeight;
          break;
        case "ne":
          newAnchorLocalX = 0;
          newAnchorLocalY = newHeight;
          break;
        case "e":
          newAnchorLocalX = 0;
          newAnchorLocalY = newHeight / 2;
          break;
        case "se":
          newAnchorLocalX = 0;
          newAnchorLocalY = 0;
          break;
        case "s":
          newAnchorLocalX = newWidth / 2;
          newAnchorLocalY = 0;
          break;
        case "sw":
          newAnchorLocalX = newWidth;
          newAnchorLocalY = 0;
          break;
        case "w":
          newAnchorLocalX = newWidth;
          newAnchorLocalY = newHeight / 2;
          break;
      }

      // Step 5: Calculate new point position such that anchor stays fixed
      // We need: anchorScreenPos = rotatePointAround(point + anchorLocal, rotation, point + size/2)
      // Solving for point:
      const angleRadPos = (origRotation * Math.PI) / 180;
      const cosPos = Math.cos(angleRadPos);
      const sinPos = Math.sin(angleRadPos);

      // Offset from anchor to center in local space
      const dx = newAnchorLocalX - newWidth / 2;
      const dy = newAnchorLocalY - newHeight / 2;

      // Solve for point position that keeps anchor fixed
      const newX = anchorScreenX - newWidth / 2 - dx * cosPos + dy * sinPos;
      const newY = anchorScreenY - newHeight / 2 - dx * sinPos - dy * cosPos;

      onResize([newWidth, newHeight], [newX, newY]);
    }
  };

  const handlePointerUp = (e: React.PointerEvent<SVGCircleElement>) => {
    e.currentTarget.releasePointerCapture(e.pointerId);
    setDraggingHandle(null);
    setDragStartPos(null);
    setOriginalShape(null);
  };

  // Helper function to rotate a point around a center
  const rotatePointAround = (
    px: number,
    py: number,
    rot: number,
    cx: number,
    cy: number
  ): [number, number] => {
    if (rot === 0) return [px, py];

    const angle = (rot * Math.PI) / 180;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    // Translate to origin
    const dx = px - cx;
    const dy = py - cy;

    // Rotate
    const rotatedX = dx * cos - dy * sin;
    const rotatedY = dx * sin + dy * cos;

    // Translate back
    return [rotatedX + cx, rotatedY + cy];
  };

  // Apply rotation transform to handle positions (uses current shape)
  const rotatePoint = (px: number, py: number): [number, number] => {
    return rotatePointAround(px, py, rotation, centerX, centerY);
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

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
  const [dragStartPos, setDragStartPos] = useState<[number, number] | null>(null);
  const [originalShape, setOriginalShape] = useState<ShapeType | null>(null);

  const { point, size, rotation = 0 } = shape;
  const [x, y] = point;
  const [width, height] = size;

  // Center (of the CURRENT rendered shape)
  const centerX = x + width / 2;
  const centerY = y + height / 2;

  // Handle positions in unrotated space (we rotate them for display)
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
      // Simple rotation: angle from center to mouse (+90° so "up" is 0°)
      const dx = mouseX - centerX;
      const dy = mouseY - centerY;
      const angle = (Math.atan2(dy, dx) * 180) / Math.PI + 90;
      onRotate(angle);
      return;
    }

    // ---------- Resize with simplified "center shift" ----------
    const [origX, origY] = originalShape.point;
    const [origWidth, origHeight] = originalShape.size;
    const origRotation = originalShape.rotation || 0;

    // 1) Mouse delta in screen space, then convert to the shape's local axes
    const screenDeltaX = mouseX - dragStartPos[0];
    const screenDeltaY = mouseY - dragStartPos[1];

    const negTheta = (-origRotation * Math.PI) / 180;
    const c = Math.cos(negTheta);
    const s = Math.sin(negTheta);
    const localDeltaX = screenDeltaX * c - screenDeltaY * s;
    const localDeltaY = screenDeltaX * s + screenDeltaY * c;

    // 2) Compute new size in local axes based on which handle is dragged
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

    // 3) Enforce minimum size
    if (newWidth < 10) newWidth = 10;
    if (newHeight < 10) newHeight = 10;

    // 4) Simplified placement: move the CENTER by half the size change along local axes,
    //    then rotate that shift back to screen space.
    const dW = newWidth - origWidth;
    const dH = newHeight - origHeight;

    // Which opposite side/corner is pinned? (signs for local center shift)
    const sx =
      draggingHandle === "e" || draggingHandle === "ne" || draggingHandle === "se"
        ? +1
        : draggingHandle === "w" || draggingHandle === "nw" || draggingHandle === "sw"
          ? -1
          : 0;

    const sy =
      draggingHandle === "s" || draggingHandle === "se" || draggingHandle === "sw"
        ? +1
        : draggingHandle === "n" || draggingHandle === "ne" || draggingHandle === "nw"
          ? -1
          : 0;

    // Local center shift
    const dCx_local = (sx * dW) / 2;
    const dCy_local = (sy * dH) / 2;

    // Rotate that shift to screen space using +θ
    const theta = (origRotation * Math.PI) / 180;
    const C = Math.cos(theta);
    const S = Math.sin(theta);
    const dCx = dCx_local * C - dCy_local * S;
    const dCy = dCx_local * S + dCy_local * C;

    // 5) New center and top-left that keep the opposite side/corner fixed
    const origCenterX = origX + origWidth / 2;
    const origCenterY = origY + origHeight / 2;
    const newCenterX = origCenterX + dCx;
    const newCenterY = origCenterY + dCy;

    const newX = newCenterX - newWidth / 2;
    const newY = newCenterY - newHeight / 2;

    onResize([newWidth, newHeight], [newX, newY]);
    // -----------------------------------------------------------
  };

  const handlePointerUp = (e: React.PointerEvent<SVGCircleElement>) => {
    e.currentTarget.releasePointerCapture(e.pointerId);
    setDraggingHandle(null);
    setDragStartPos(null);
    setOriginalShape(null);
  };

  // Rotate a point (px,py) around center (cx,cy) by 'rot' degrees
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
    const dx = px - cx;
    const dy = py - cy;
    const rx = dx * cos - dy * sin;
    const ry = dx * sin + dy * cos;
    return [rx + cx, ry + cy];
  };

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

      {/* Resize handles (rotated for display) */}
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

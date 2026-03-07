import React, { useState } from "react";
import { Shape as ShapeType } from "../../types/canvas";
import { DOMVector, screenToCanvas } from "../../utils/vec";
import { getBounds } from "../../utils/canvas_utils";
import { useShapeStore } from "../../hooks/useShapeStore";
import { useCamera } from "../../hooks/useCamera";
import {
  getDraggedRotation,
  getPointerAngleFromCenter,
  getRotationHandleOffset,
} from "./selectionBoxMath";

type HandleType = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "rotate";

interface SelectionBoxProps {
  shape: ShapeType;
  zoom: number;
  onResize: (
    newSize: [number, number],
    newPoint: [number, number],
    newFontSize?: number
  ) => void;
  onRotate: (newRotation: number) => void;
}

type DragSession = {
  handle: HandleType;
  startPoint: [number, number];
  originalShape: ShapeType;
  originalCenter: [number, number];
  startPointerAngle: number | null;
};

const HANDLE_SIZE = 8;

// Keep sizing math aligned with what is actually rendered, especially for text.
const getShapeDimensions = (shape: ShapeType) => {
  if (shape.type === "text") {
    const measured = getBounds(shape.text ?? "", 0, 0, shape.fontSize);
    return {
      width: Math.abs(measured?.width ?? shape.size?.[0] ?? 0),
      height: Math.abs(measured?.height ?? shape.size?.[1] ?? 0),
    };
  }

  return {
    width: Math.abs(shape.size?.[0] ?? 0),
    height: Math.abs(shape.size?.[1] ?? 0),
  };
};

export function SelectionBox({
  shape,
  zoom,
  onResize,
  onRotate,
}: SelectionBoxProps) {
  const [dragSession, setDragSession] = useState<DragSession | null>(null);

  const { point, size, rotation = 0 } = shape;
  const { width, height } = getShapeDimensions(shape);
  const vector = new DOMVector(point[0], point[1], size[0], size[1]);
  const rect = vector.toDOMRect();
  const x = rect.x;
  const y = rect.y;

  // Use normalized bounds so handles work even if size components are negative.
  const centerX = x + width / 2;
  const centerY = y + height / 2;

  const { camera } = useCamera(); // SelectionBox needs camera for screenToCanvas in handlers.

  // Thin shapes are overly sensitive when the rotation handle sits too close to center.
  const rotationHandleOffset = getRotationHandleOffset(width, height, zoom);

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
    rotate: [x + width / 2, y - rotationHandleOffset],
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
    const originalCenter: [number, number] = [centerX, centerY];
    setDragSession({
      handle,
      startPoint: [x, y],
      originalShape: {
        ...shape,
        point: [...shape.point],
        size: [...shape.size],
      },
      originalCenter,
      startPointerAngle:
        handle === "rotate"
          ? getPointerAngleFromCenter(originalCenter, [x, y])
          : null,
    });

    // Save history before operation starts
    const store = useShapeStore.getState();
    store.pushHistory();

    if (handle === "rotate") {
      useShapeStore.setState({ isRotatingShape: true });
    } else {
      useShapeStore.setState({ isResizingShape: true });
    }
  };

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!dragSession) return;

    const { x: mouseX, y: mouseY } = screenToCanvas(
      { x: e.clientX, y: e.clientY },
      camera
    );

    if (dragSession.handle === "rotate") {
      if (dragSession.startPointerAngle === null) return;

      const currentPointerAngle = getPointerAngleFromCenter(
        dragSession.originalCenter,
        [mouseX, mouseY]
      );
      const nextRotation = getDraggedRotation(
        dragSession.originalShape.rotation || 0,
        dragSession.startPointerAngle,
        currentPointerAngle
      );

      onRotate(nextRotation);
      return;
    }

    // ---------- Resize with simplified "center shift" ----------
    const originalVector = new DOMVector(
      dragSession.originalShape.point[0],
      dragSession.originalShape.point[1],
      dragSession.originalShape.size[0],
      dragSession.originalShape.size[1]
    );
    const originalRect = originalVector.toDOMRect();
    const origX = originalRect.x;
    const origY = originalRect.y;
    const { width: origWidth, height: origHeight } = getShapeDimensions(
      dragSession.originalShape
    );
    const origRotation = dragSession.originalShape.rotation || 0;

    // 1) Mouse delta in screen space, then convert to the shape's local axes
    const screenDeltaX = mouseX - dragSession.startPoint[0];
    const screenDeltaY = mouseY - dragSession.startPoint[1];

    const negTheta = (-origRotation * Math.PI) / 180;
    const c = Math.cos(negTheta);
    const s = Math.sin(negTheta);
    const localDeltaX = screenDeltaX * c - screenDeltaY * s;
    const localDeltaY = screenDeltaX * s + screenDeltaY * c;

    // 2) Compute new size in local axes based on which handle is dragged
    let newWidth = origWidth;
    let newHeight = origHeight;
    let newFontSize: number | undefined;

    switch (dragSession.handle) {
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
    switch (dragSession.handle) {
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

    // 3b) Lock aspect ratio for text by applying uniform scale
    let scaleForText: number | null = null;
    if (dragSession.originalShape.type === "text") {
      const widthRatio = origWidth ? newWidth / origWidth : 1;
      const heightRatio = origHeight ? newHeight / origHeight : 1;
      const isHorizontal =
        dragSession.handle === "e" || dragSession.handle === "w";
      const isVertical =
        dragSession.handle === "n" || dragSession.handle === "s";
      const axisScale = isHorizontal
        ? widthRatio
        : isVertical
          ? heightRatio
          : Math.abs(widthRatio - 1) > Math.abs(heightRatio - 1)
            ? widthRatio
            : heightRatio;
      const uniformScale = Math.max(axisScale, 0.1);

      newWidth = origWidth * uniformScale;
      newHeight = origHeight * uniformScale;
      scaleForText = uniformScale;
    }

    // For text, recompute dimensions from measured bounds to account for padding,
    // so the pinned corner stays accurate.
    if (dragSession.originalShape.type === "text" && scaleForText) {
      const nextFontSize =
        (dragSession.originalShape.fontSize || 16) * scaleForText;
      const measured = getBounds(
        dragSession.originalShape.text ?? "",
        0,
        0,
        nextFontSize
      );
      newWidth = measured.width;
      newHeight = measured.height;
      newFontSize = nextFontSize;
    }

    // 4) Simplified placement: move the CENTER by half the size change along local axes,
    //    then rotate that shift back to screen space.
    const dW = newWidth - origWidth;
    const dH = newHeight - origHeight;

    // Which opposite side/corner is pinned? (signs for local center shift)
    const sx =
      dragSession.handle === "e" ||
      dragSession.handle === "ne" ||
      dragSession.handle === "se"
        ? +1
        : dragSession.handle === "w" ||
            dragSession.handle === "nw" ||
            dragSession.handle === "sw"
          ? -1
          : 0;

    const sy =
      dragSession.handle === "s" ||
      dragSession.handle === "se" ||
      dragSession.handle === "sw"
        ? +1
        : dragSession.handle === "n" ||
            dragSession.handle === "ne" ||
            dragSession.handle === "nw"
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

    onResize([newWidth, newHeight], [newX, newY], newFontSize);
    // -----------------------------------------------------------
  };

  const handlePointerUp = (e: React.PointerEvent<SVGCircleElement>) => {
    e.stopPropagation();
    e.currentTarget.releasePointerCapture(e.pointerId);
    setDragSession(null);

    // Clear operation flags
    useShapeStore.setState({
      isResizingShape: false,
      isRotatingShape: false,
    });
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
    <g data-selection-box-shape-id={shape.id} onPointerMove={handlePointerMove}>
      {/* Selection rectangle */}
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        fill="none"
        stroke="#4A90E2"
        strokeWidth={2 / zoom}
        strokeDasharray={`${5 / zoom},${5 / zoom}`}
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
              data-selection-handle={type}
              cx={rotatedX}
              cy={rotatedY}
              r={HANDLE_SIZE / zoom}
              fill="white"
              stroke="#4A90E2"
              strokeWidth={2 / zoom}
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
          strokeWidth={2 / zoom}
          strokeDasharray={`${3 / zoom},${3 / zoom}`}
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
              data-selection-handle="rotate"
              cx={rotatedX}
              cy={rotatedY}
              r={HANDLE_SIZE / zoom}
              fill="#4A90E2"
              stroke="white"
              strokeWidth={2 / zoom}
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

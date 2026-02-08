import * as React from "react";
import { useRef } from "react";
import type { Camera } from "../types/canvas";
import { getCameraZoom, screenToWorld } from "../utils/canvas_utils";
import { useShapeStore } from "./useShapeStore";

export interface TouchInteraction {
  pointerId: number;
  origin: { x: number; y: number };
  hasMoved: boolean;
}

interface UseTouchGesturesOptions {
  svgRef: React.RefObject<SVGSVGElement | null>;
  cameraRef: React.RefObject<Camera>;
  applyCameraImmediate: (camera: Camera) => void;
  setIsPanning: (v: boolean) => void;
  setLastPanPosition: (v: { x: number; y: number } | null) => void;
  setDragVector: (v: null) => void;
  setIsDragging: (v: boolean) => void;
  clearDragging: () => void;
}

export function useTouchGestures({
  svgRef,
  cameraRef,
  applyCameraImmediate,
  setIsPanning,
  setLastPanPosition,
  setDragVector,
  setIsDragging,
  clearDragging,
}: UseTouchGesturesOptions) {
  const touchPointersRef = useRef(new Map<number, { x: number; y: number }>());
  const touchGestureRef = useRef<{
    isActive: boolean;
    startDistance: number;
    startMidpoint: [number, number];
    startCamera: Camera;
    startWorldPoint: [number, number];
  }>({
    isActive: false,
    startDistance: 0,
    startMidpoint: [0, 0],
    startCamera: { x: 0, y: 0, z: 1 },
    startWorldPoint: [0, 0],
  });
  const touchPanRef = useRef<TouchInteraction | null>(null);
  const touchPlaceRef = useRef<TouchInteraction | null>(null);

  const getTouchGestureStats = () => {
    const points = Array.from(touchPointersRef.current.values());
    if (points.length < 2) return null;
    const [p1, p2] = points.slice(0, 2);
    const midpoint: [number, number] = [
      (p1.x + p2.x) / 2,
      (p1.y + p2.y) / 2,
    ];
    const distance = Math.hypot(p1.x - p2.x, p1.y - p2.y);
    if (!Number.isFinite(distance) || distance === 0) return null;
    return { midpoint, distance };
  };

  const resetTouchInteractions = () => {
    if (touchPanRef.current && svgRef.current?.hasPointerCapture(touchPanRef.current.pointerId)) {
      svgRef.current.releasePointerCapture(touchPanRef.current.pointerId);
    }
    touchPanRef.current = null;
    if (touchPlaceRef.current && svgRef.current?.hasPointerCapture(touchPlaceRef.current.pointerId)) {
      svgRef.current.releasePointerCapture(touchPlaceRef.current.pointerId);
    }
    touchPlaceRef.current = null;
    setIsPanning(false);
    setLastPanPosition(null);
    setDragVector(null);
    setIsDragging(false);
    clearDragging();
    useShapeStore.setState({ isDraggingShape: false });
  };

  const onPointerDownCapture = (e: React.PointerEvent<SVGElement>) => {
    if (e.pointerType !== "touch") return;
    touchPointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (touchPointersRef.current.size >= 2) {
      const gesture = getTouchGestureStats();
      if (gesture) {
        touchGestureRef.current = {
          isActive: true,
          startDistance: gesture.distance,
          startMidpoint: gesture.midpoint,
          startCamera: cameraRef.current,
          startWorldPoint: screenToWorld(gesture.midpoint, cameraRef.current),
        };
        resetTouchInteractions();
      }
    }

    if (touchGestureRef.current.isActive) {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  const onPointerMoveCapture = (e: React.PointerEvent<SVGElement>) => {
    if (e.pointerType !== "touch") return;
    if (!touchPointersRef.current.has(e.pointerId)) return;
    touchPointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (!touchGestureRef.current.isActive || touchPointersRef.current.size < 2) {
      return;
    }

    const gesture = getTouchGestureStats();
    if (!gesture) return;

    const scale = gesture.distance / touchGestureRef.current.startDistance;
    const nextZ = getCameraZoom(touchGestureRef.current.startCamera.z * scale);
    const [worldX, worldY] = touchGestureRef.current.startWorldPoint;
    const [midX, midY] = gesture.midpoint;
    const nextX = midX / nextZ - worldX;
    const nextY = midY / nextZ - worldY;

    applyCameraImmediate({ x: nextX, y: nextY, z: nextZ });
    e.preventDefault();
    e.stopPropagation();
  };

  const onPointerUpCapture = (e: React.PointerEvent<SVGElement>) => {
    if (e.pointerType !== "touch") return;
    const wasPinching = touchGestureRef.current.isActive;
    touchPointersRef.current.delete(e.pointerId);
    if (touchPointersRef.current.size < 2) {
      touchGestureRef.current.isActive = false;
    }

    if (wasPinching) {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  // Accessors for touch state — lets callers read/write without
  // directly mutating hook-owned refs (satisfies React Compiler).
  const getTouchPan = () => touchPanRef.current;
  const setTouchPan = (v: TouchInteraction | null) => { touchPanRef.current = v; };
  const markTouchPanMoved = () => { if (touchPanRef.current) touchPanRef.current.hasMoved = true; };

  const getTouchPlace = () => touchPlaceRef.current;
  const setTouchPlace = (v: TouchInteraction | null) => { touchPlaceRef.current = v; };
  const markTouchPlaceMoved = () => { if (touchPlaceRef.current) touchPlaceRef.current.hasMoved = true; };

  const isTouchGestureActive = () => touchGestureRef.current.isActive;

  return {
    isTouchGestureActive,
    getTouchPan,
    setTouchPan,
    markTouchPanMoved,
    getTouchPlace,
    setTouchPlace,
    markTouchPlaceMoved,
    onPointerDownCapture,
    onPointerMoveCapture,
    onPointerUpCapture,
    resetTouchInteractions,
  };
}

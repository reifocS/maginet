import { useEffect, useRef, useState } from "react";
import { Handler, useGesture } from "@use-gesture/react";
import { useCamera } from "./useCamera";
import inputs, { normalizeWheel } from "../board/inputs";
import { panCamera } from "../utils/canvas_utils";
import { Point } from "../types/canvas";

interface UseCanvasGesturesOptions {
  isSetupComplete: boolean;
}

export function useCanvasGestures({ isSetupComplete }: UseCanvasGesturesOptions) {
  const {
    camera,
    setCamera,
    cameraRef,
    applyCameraImmediate,
    applyZoomDelta,
    applyZoomStep,
  } = useCamera();

  const [isPanning, setIsPanning] = useState(false);
  const [lastPanPosition, setLastPanPosition] = useState<Point | null>(null);
  const [isSpacePressed, setIsSpacePressed] = useState(false);
  const [isCommandPressed, setIsCommandPressed] = useState(false);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });

  const handleWheelRef = useRef<Handler<"wheel">>(() => { });
  const gestureHandlersRef = useRef({
    onWheel: (state: Parameters<Handler<"wheel">>[0]) =>
      handleWheelRef.current(state),
  });
  const gestureConfigRef = useRef({
    target: document.body,
    eventOptions: { passive: false },
  });

  handleWheelRef.current = (state) => {
    if (!isSetupComplete) return;
    const { event, delta, ctrlKey } = state;
    const target = event.target as HTMLElement | null;
    if (target?.closest(".selection-panel, .help-dialog, .Modal__modal")) {
      return;
    }
    event.preventDefault();
    // Ctrl+scroll or pinch = zoom, regular scroll = pan
    if (ctrlKey || event.metaKey) {
      const { point } = inputs.wheel(event);
      const z = normalizeWheel(event)[2];
      applyZoomDelta([point[0], point[1]], z);
    } else {
      // Regular scroll pans (good for trackpad)
      // Smooth pan with reduced sensitivity
      applyCameraImmediate(
        panCamera(cameraRef.current, delta[0] * 0.8, delta[1] * 0.8)
      );
    }
  };

  // Gesture handling
  useGesture(gestureHandlersRef.current, gestureConfigRef.current);

  useEffect(() => {
    if (isPanning) {
      document.body.style.cursor = "grabbing";
    } else if (isSpacePressed) {
      document.body.style.cursor = "grab";
    } else {
      document.body.style.cursor = "default";
    }
  }, [isPanning, isSpacePressed]);

  return {
    camera,
    setCamera,
    cameraRef,
    applyCameraImmediate,
    applyZoomDelta,
    applyZoomStep,
    isPanning,
    setIsPanning,
    lastPanPosition,
    setLastPanPosition,
    isSpacePressed,
    setIsSpacePressed,
    isCommandPressed,
    setIsCommandPressed,
    mousePosition,
    setMousePosition,
  };
}

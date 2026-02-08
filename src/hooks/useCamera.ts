import { useEffect, useRef, useState } from "react";
import { Camera } from "../types/canvas";
import { getCameraZoom, screenToWorld } from "../utils/canvas_utils";

function smoothDamp(
  current: number,
  target: number,
  currentVelocity: number,
  smoothTime: number,
  maxSpeed: number,
  deltaTime: number
) {
  const safeSmoothTime = Math.max(0.0001, smoothTime);
  const omega = 2 / safeSmoothTime;
  const x = omega * deltaTime;
  const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  let change = current - target;
  const originalTo = target;
  const maxChange = maxSpeed * safeSmoothTime;
  change = Math.max(-maxChange, Math.min(maxChange, change));
  target = current - change;
  const temp = (currentVelocity + omega * change) * deltaTime;
  const nextVelocity = (currentVelocity - omega * temp) * exp;
  let output = target + (change + temp) * exp;

  if ((originalTo - current > 0) === (output > originalTo)) {
    output = originalTo;
    return { value: output, velocity: 0 };
  }

  return { value: output, velocity: nextVelocity };
}

export function useCamera() {
  const [camera, setCamera] = useState<Camera>({ x: 0, y: 0, z: 1 });
  const cameraRef = useRef(camera);
  const cameraTargetRef = useRef(camera);
  const cameraVelocityRef = useRef({ x: 0, y: 0, z: 0 });
  const cameraAnimationRef = useRef<number | null>(null);
  const cameraLastTimeRef = useRef<number | null>(null);
  const zoomAnchorRef = useRef<{
    screen: number[];
    world: number[];
  } | null>(null);

  const applyCameraImmediate = (next: Camera) => {
    if (cameraAnimationRef.current !== null) {
      cancelAnimationFrame(cameraAnimationRef.current);
      cameraAnimationRef.current = null;
    }
    cameraLastTimeRef.current = null;
    cameraVelocityRef.current = { x: 0, y: 0, z: 0 };
    zoomAnchorRef.current = null;
    cameraTargetRef.current = next;
    cameraRef.current = next;
    setCamera(next);
  };

  const animateCamera = (time: number) => {
    const lastTime = cameraLastTimeRef.current ?? time;
    const deltaTime = Math.min(0.032, (time - lastTime) / 1000);
    cameraLastTimeRef.current = time;

    const current = cameraRef.current;
    const target = cameraTargetRef.current;
    const velocity = cameraVelocityRef.current;

    const nextX = smoothDamp(current.x, target.x, velocity.x, 0.14, 8000, deltaTime);
    const nextY = smoothDamp(current.y, target.y, velocity.y, 0.14, 8000, deltaTime);
    const nextZ = smoothDamp(current.z, target.z, velocity.z, 0.12, 20, deltaTime);
    const zoomAnchor = zoomAnchorRef.current;
    const anchoredX = zoomAnchor
      ? zoomAnchor.screen[0] / nextZ.value - zoomAnchor.world[0]
      : nextX.value;
    const anchoredY = zoomAnchor
      ? zoomAnchor.screen[1] / nextZ.value - zoomAnchor.world[1]
      : nextY.value;

    const nextCamera = { x: anchoredX, y: anchoredY, z: nextZ.value };
    cameraVelocityRef.current = {
      x: zoomAnchor ? 0 : nextX.velocity,
      y: zoomAnchor ? 0 : nextY.velocity,
      z: nextZ.velocity,
    };
    cameraRef.current = nextCamera;
    setCamera(nextCamera);

    const positionDelta = Math.hypot(nextCamera.x - target.x, nextCamera.y - target.y);
    const zoomDelta = Math.abs(nextCamera.z - target.z);
    const velocityDelta =
      Math.abs(cameraVelocityRef.current.x) +
      Math.abs(cameraVelocityRef.current.y) +
      Math.abs(cameraVelocityRef.current.z);

    if (positionDelta < 0.01 && zoomDelta < 0.0005 && velocityDelta < 0.002) {
      cameraRef.current = target;
      cameraVelocityRef.current = { x: 0, y: 0, z: 0 };
      zoomAnchorRef.current = null;
      cameraAnimationRef.current = null;
      cameraLastTimeRef.current = null;
      setCamera(target);
      return;
    }

    cameraAnimationRef.current = requestAnimationFrame(animateCamera);
  };

  const applyCameraTarget = (next: Camera) => {
    cameraTargetRef.current = next;
    if (cameraAnimationRef.current === null) {
      cameraAnimationRef.current = requestAnimationFrame(animateCamera);
    }
  };

  const applyZoomDelta = (point: number[], delta: number) => {
    if (delta === 0) return;
    const current = cameraRef.current;
    const target = cameraTargetRef.current;
    const zoomFactor = Math.exp(-delta * 0.008);
    const nextZ = getCameraZoom(target.z * zoomFactor);
    const worldPoint = screenToWorld(point, current);
    zoomAnchorRef.current = { screen: point, world: worldPoint };
    const nextX = point[0] / nextZ - worldPoint[0];
    const nextY = point[1] / nextZ - worldPoint[1];
    applyCameraTarget({ x: nextX, y: nextY, z: nextZ });
  };

  const applyZoomStep = (point: number[], direction: "in" | "out") => {
    const factor = direction === "in" ? 1.12 : 1 / 1.12;
    const current = cameraRef.current;
    const target = cameraTargetRef.current;
    const nextZ = getCameraZoom(target.z * factor);
    const worldPoint = screenToWorld(point, current);
    zoomAnchorRef.current = { screen: point, world: worldPoint };
    const nextX = point[0] / nextZ - worldPoint[0];
    const nextY = point[1] / nextZ - worldPoint[1];
    applyCameraTarget({ x: nextX, y: nextY, z: nextZ });
  };

  useEffect(() => {
    cameraRef.current = camera;
  }, [camera]);

  useEffect(() => {
    return () => {
      if (cameraAnimationRef.current !== null) {
        cancelAnimationFrame(cameraAnimationRef.current);
      }
    };
  }, []);

  return {
    camera,
    setCamera,
    cameraRef,
    applyCameraImmediate,
    applyCameraTarget,
    applyZoomDelta,
    applyZoomStep,
  };
}

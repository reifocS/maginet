export type Point2D = [number, number];

export const ROTATION_HANDLE_OFFSET = 30;
export const ROTATION_HANDLE_MIN_SCREEN_DISTANCE = 40;
export const ROTATION_HANDLE_MAX_SCREEN_DISTANCE = 72;
const ROTATION_HANDLE_SCREEN_SCALE = 0.6;

export function getPointerAngleFromCenter(
  center: Point2D,
  point: Point2D
) {
  const dx = point[0] - center[0];
  const dy = point[1] - center[1];
  return (Math.atan2(dy, dx) * 180) / Math.PI + 90;
}

export function normalizeAngleDelta(delta: number) {
  let normalized = ((delta + 180) % 360 + 360) % 360 - 180;

  if (normalized === -180 && delta > 0) {
    normalized = 180;
  }

  return normalized;
}

export function getDraggedRotation(
  initialRotation: number,
  startPointerAngle: number,
  currentPointerAngle: number
) {
  return initialRotation + normalizeAngleDelta(currentPointerAngle - startPointerAngle);
}

export function getRotationHandleOffset(
  width: number,
  height: number,
  zoom: number
) {
  const safeZoom = Math.max(zoom, 0.0001);
  const screenMaxDimension = Math.max(width, height) * safeZoom;
  const desiredScreenRadius = Math.max(
    ROTATION_HANDLE_MIN_SCREEN_DISTANCE,
    Math.min(
      ROTATION_HANDLE_MAX_SCREEN_DISTANCE,
      screenMaxDimension * ROTATION_HANDLE_SCREEN_SCALE
    )
  );

  return Math.max(
    ROTATION_HANDLE_OFFSET / safeZoom,
    desiredScreenRadius / safeZoom - height / 2
  );
}

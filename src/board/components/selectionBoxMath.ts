export type Point2D = [number, number];

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


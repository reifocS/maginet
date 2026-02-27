import { useState } from "react";
import { Camera, Shape } from "../types/canvas";
import { screenToWorld } from "../utils/canvas_utils";

const OBJECT_SNAP_THRESHOLD_PX = 10;

type SmartGuideState = {
  vertical: number | null;
  horizontal: number | null;
};

type SnapContext = {
  movingShape: Shape;
  excludeIds?: string[];
  movingShapes?: Shape[];
  dragDelta?: [number, number];
};

interface UseObjectSnappingOptions {
  isSnapEnabled: boolean;
  shapes: Shape[];
  camera: Camera;
  viewportSize: { width: number; height: number };
}

export function useObjectSnapping({
  isSnapEnabled,
  shapes,
  camera,
  viewportSize,
}: UseObjectSnappingOptions) {
  const [smartGuides, setSmartGuides] = useState<SmartGuideState>({
    vertical: null,
    horizontal: null,
  });

  const clearSmartGuides = () => {
    setSmartGuides((prev) => {
      if (prev.vertical === null && prev.horizontal === null) {
        return prev;
      }
      return { vertical: null, horizontal: null };
    });
  };

  const getShapeBounds = (shape: Shape, pointOverride?: [number, number]) => {
    const [xRaw, yRaw] = pointOverride ?? (shape.point as [number, number]);
    const [wRaw, hRaw] = shape.size as [number, number];
    const left = wRaw >= 0 ? xRaw : xRaw + wRaw;
    const top = hRaw >= 0 ? yRaw : yRaw + hRaw;
    const width = Math.abs(wRaw);
    const height = Math.abs(hRaw);
    const right = left + width;
    const bottom = top + height;
    return {
      left,
      right,
      top,
      bottom,
      centerX: left + width / 2,
      centerY: top + height / 2,
    };
  };

  const snapPointToGrid = (
    point: [number, number],
    context?: SnapContext
  ) => {
    if (!isSnapEnabled || !context) {
      if (context && !isSnapEnabled) clearSmartGuides();
      return point;
    }

    const movingBounds =
      context.movingShapes &&
        context.movingShapes.length > 1 &&
        context.dragDelta
        ? (() => {
          const [dx, dy] = context.dragDelta;
          let left = Number.POSITIVE_INFINITY;
          let top = Number.POSITIVE_INFINITY;
          let right = Number.NEGATIVE_INFINITY;
          let bottom = Number.NEGATIVE_INFINITY;

          for (const movingShape of context.movingShapes) {
            const bounds = getShapeBounds(movingShape, [
              movingShape.point[0] + dx,
              movingShape.point[1] + dy,
            ]);
            left = Math.min(left, bounds.left);
            top = Math.min(top, bounds.top);
            right = Math.max(right, bounds.right);
            bottom = Math.max(bottom, bounds.bottom);
          }

          return {
            left,
            top,
            right,
            bottom,
            centerX: (left + right) / 2,
            centerY: (top + bottom) / 2,
          };
        })()
        : getShapeBounds(context.movingShape, point);
    const movingAnchorsX = [movingBounds.left, movingBounds.centerX, movingBounds.right];
    const movingAnchorsY = [movingBounds.top, movingBounds.centerY, movingBounds.bottom];
    const snapThreshold = OBJECT_SNAP_THRESHOLD_PX / Math.max(camera.z, 0.001);

    let snapDeltaX = 0;
    let snapDeltaY = 0;
    let guideX: number | null = null;
    let guideY: number | null = null;
    let bestXDistance = Number.POSITIVE_INFINITY;
    let bestYDistance = Number.POSITIVE_INFINITY;

    const trySnapX = (source: number, target: number) => {
      const delta = target - source;
      const distance = Math.abs(delta);
      if (distance > snapThreshold) return;
      if (distance < bestXDistance) {
        bestXDistance = distance;
        snapDeltaX = delta;
        guideX = target;
      }
    };

    const trySnapY = (source: number, target: number) => {
      const delta = target - source;
      const distance = Math.abs(delta);
      if (distance > snapThreshold) return;
      if (distance < bestYDistance) {
        bestYDistance = distance;
        snapDeltaY = delta;
        guideY = target;
      }
    };

    const excludedIds = new Set(context.excludeIds ?? []);
    excludedIds.add(context.movingShape.id);

    for (const candidate of shapes) {
      if (excludedIds.has(candidate.id)) continue;
      const bounds = getShapeBounds(candidate);
      const candidateAnchorsX = [bounds.left, bounds.centerX, bounds.right];
      const candidateAnchorsY = [bounds.top, bounds.centerY, bounds.bottom];
      for (const source of movingAnchorsX) {
        for (const target of candidateAnchorsX) {
          trySnapX(source, target);
        }
      }
      for (const source of movingAnchorsY) {
        for (const target of candidateAnchorsY) {
          trySnapY(source, target);
        }
      }
    }

    if (viewportSize.width > 0 && viewportSize.height > 0) {
      const viewportCenter = screenToWorld(
        [viewportSize.width / 2, viewportSize.height / 2],
        camera
      );
      trySnapX(movingBounds.centerX, viewportCenter[0]);
      trySnapY(movingBounds.centerY, viewportCenter[1]);
    }

    const snappedX = guideX !== null ? point[0] + snapDeltaX : point[0];
    const snappedY = guideY !== null ? point[1] + snapDeltaY : point[1];

    setSmartGuides((prev) => {
      const nextVertical = guideX;
      const nextHorizontal = guideY;
      if (prev.vertical === nextVertical && prev.horizontal === nextHorizontal) {
        return prev;
      }
      return { vertical: nextVertical, horizontal: nextHorizontal };
    });

    return [snappedX, snappedY] as [number, number];
  };

  return {
    smartGuides,
    clearSmartGuides,
    snapPointToGrid,
  };
}

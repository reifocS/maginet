import { Shape as ShapeType } from "../../types/canvas";
import { getBounds } from "../../utils/canvas_utils";

type ShapeDimensions = {
  width: number;
  height: number;
};

function rotateVector(
  vector: [number, number],
  angleDegrees: number
): [number, number] {
  if (angleDegrees === 0) {
    return vector;
  }

  const angle = (angleDegrees * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);

  return [
    vector[0] * cos - vector[1] * sin,
    vector[0] * sin + vector[1] * cos,
  ];
}

function getRotatedTopLeftOffset(
  dimensions: ShapeDimensions,
  rotation: number
): [number, number] {
  const halfWidth = dimensions.width / 2;
  const halfHeight = dimensions.height / 2;
  const rotatedHalf = rotateVector([-halfWidth, -halfHeight], rotation);

  return [halfWidth + rotatedHalf[0], halfHeight + rotatedHalf[1]];
}

export function getShapeRenderDimensions(shape: ShapeType): ShapeDimensions {
  if (shape.type === "text") {
    const bounds = getBounds(shape.text ?? "", 0, 0, shape.fontSize);
    return {
      width: bounds.width,
      height: bounds.height,
    };
  }

  return {
    width: Math.abs(shape.size[0]),
    height: Math.abs(shape.size[1]),
  };
}

export function getShapeRotationTransform(shape: ShapeType) {
  const { width, height } = getShapeRenderDimensions(shape);

  return `rotate(${shape.rotation || 0} ${shape.point[0] + width / 2} ${
    shape.point[1] + height / 2
  })`;
}

export function getAdjustedPointForFixedRotatedTopLeft(
  point: [number, number],
  previousDimensions: ShapeDimensions,
  nextDimensions: ShapeDimensions,
  rotation: number
): [number, number] {
  if (rotation === 0) {
    return point;
  }

  const previousOffset = getRotatedTopLeftOffset(previousDimensions, rotation);
  const nextOffset = getRotatedTopLeftOffset(nextDimensions, rotation);

  return [
    point[0] + previousOffset[0] - nextOffset[0],
    point[1] + previousOffset[1] - nextOffset[1],
  ];
}

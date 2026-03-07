import { describe, expect, it } from "vitest";
import {
  getAdjustedPointForFixedRotatedTopLeft,
  getShapeRotationTransform,
} from "./shapeTransforms";
import { Shape } from "../../types/canvas";

describe("shapeTransforms", () => {
  it("keeps the point unchanged when rotation is zero", () => {
    expect(
      getAdjustedPointForFixedRotatedTopLeft(
        [100, 50],
        { width: 40, height: 20 },
        { width: 90, height: 20 },
        0
      )
    ).toEqual([100, 50]);
  });

  it("adjusts point to keep the rotated top-left stable as text width changes", () => {
    expect(
      getAdjustedPointForFixedRotatedTopLeft(
        [100, 50],
        { width: 10, height: 10 },
        { width: 20, height: 10 },
        90
      )
    ).toEqual([95, 55]);
  });

  it("builds a text rotation transform from measured text bounds", () => {
    const shape: Shape = {
      id: "text-1",
      type: "text",
      point: [10, 20],
      size: [0, 0],
      srcIndex: 0,
      text: "AB",
      fontSize: 16,
      rotation: 45,
    };

    const transform = getShapeRotationTransform(shape);
    expect(transform).toMatch(/^rotate\(45 /);
  });
});


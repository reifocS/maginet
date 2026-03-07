import { describe, expect, it } from "vitest";
import {
  getDraggedRotation,
  getPointerAngleFromCenter,
  normalizeAngleDelta,
} from "./selectionBoxMath";

describe("selectionBoxMath", () => {
  it("keeps the initial rotation when the pointer has not moved", () => {
    const center: [number, number] = [100, 100];
    const startPointer: [number, number] = [108, 44];
    const startAngle = getPointerAngleFromCenter(center, startPointer);

    expect(getDraggedRotation(35, startAngle, startAngle)).toBe(35);
  });

  it("normalizes angle deltas across the wrap boundary", () => {
    expect(normalizeAngleDelta(340)).toBe(-20);
    expect(normalizeAngleDelta(-340)).toBe(20);
    expect(normalizeAngleDelta(181)).toBe(-179);
  });

  it("applies rotation deltas relative to the drag start angle", () => {
    expect(getDraggedRotation(10, 170, -170)).toBe(30);
    expect(getDraggedRotation(-20, -175, 175)).toBe(-30);
  });
});


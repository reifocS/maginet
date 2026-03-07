import { describe, expect, it } from "vitest";
import {
  getDraggedRotation,
  getPointerAngleFromCenter,
  getRotationHandleOffset,
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

  it("keeps a larger rotation-handle radius when zoomed out", () => {
    expect(getRotationHandleOffset(240, 20, 1)).toBe(62);
    expect(getRotationHandleOffset(240, 20, 0.5)).toBe(134);
  });

  it("keeps the handle compact for small shapes at normal zoom", () => {
    expect(getRotationHandleOffset(60, 30, 1)).toBe(30);
    expect(getRotationHandleOffset(80, 40, 1)).toBe(30);
  });

  it("still adds extra radius for small shapes when zoomed out", () => {
    expect(getRotationHandleOffset(60, 30, 0.5)).toBe(65);
    expect(getRotationHandleOffset(80, 40, 0.5)).toBe(60);
  });

  it("keeps zoomed-in tiny shapes reachable on screen", () => {
    expect(getRotationHandleOffset(11, 12, 10)).toBe(3);
    expect(getRotationHandleOffset(20, 20, 10)).toBe(3);
  });
});

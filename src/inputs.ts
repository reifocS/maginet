import React from "react";
import vec from "./utils/vec";

interface PointerInfo {
  target: string;
  pointerId: number;
  origin: number[];
  point: number[];
  pressure: number;
  shiftKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
}
function isDarwin(): boolean {
  return /Mac|iPod|iPhone|iPad/.test(window.navigator.platform);
}
const DOUBLE_CLICK_DURATION = 250;
const MAX_ZOOM_STEP = 5;
function getPoint(
  e: PointerEvent | React.PointerEvent | Touch | React.Touch | WheelEvent
): number[] {
  return [
    Number(e.clientX.toPrecision(5)),
    Number(e.clientY.toPrecision(5)),
    "pressure" in e ? Number(e.pressure.toPrecision(5)) || 0.5 : 0.5,
  ];
}
class Inputs {
  activePointerId?: number;
  pointerUpTime = 0;
  points: Record<string, PointerInfo> = {};
  pointer?: PointerInfo;

  touchStart(e: TouchEvent | React.TouchEvent, target: string) {
    const { shiftKey, ctrlKey, metaKey, altKey } = e;
    e.preventDefault();

    const touch = e.changedTouches[0];

    const info = {
      target,
      pointerId: touch.identifier,
      origin: getPoint(touch),
      point: getPoint(touch),
      pressure: 0.5,
      shiftKey,
      ctrlKey,
      metaKey: isDarwin() ? metaKey : ctrlKey,
      altKey,
    };

    this.points[touch.identifier] = info;
    this.activePointerId = touch.identifier;

    this.pointer = info;
    return info;
  }

  touchMove(e: TouchEvent | React.TouchEvent) {
    const { shiftKey, ctrlKey, metaKey, altKey } = e;
    e.preventDefault();

    const touch = e.changedTouches[0];

    const prev = this.points[touch.identifier];

    const info = {
      ...prev,
      pointerId: touch.identifier,
      point: getPoint(touch),
      pressure: 0.5,
      shiftKey,
      ctrlKey,
      metaKey: isDarwin() ? metaKey : ctrlKey,
      altKey,
    };

    if (this.points[touch.identifier]) {
      this.points[touch.identifier] = info;
    }

    this.pointer = info;
    return info;
  }

  pointerDown(e: PointerEvent | React.PointerEvent, target: string) {
    const { shiftKey, ctrlKey, metaKey, altKey } = e;

    const info = {
      target,
      pointerId: e.pointerId,
      origin: getPoint(e),
      point: getPoint(e),
      pressure: e.pressure || 0.5,
      shiftKey,
      ctrlKey,
      metaKey: isDarwin() ? metaKey : ctrlKey,
      altKey,
    };

    this.points[e.pointerId] = info;
    this.activePointerId = e.pointerId;

    this.pointer = info;
    return info;
  }

  pointerEnter(e: PointerEvent | React.PointerEvent, target: string) {
    const { shiftKey, ctrlKey, metaKey, altKey } = e;

    const info = {
      target,
      pointerId: e.pointerId,
      origin: getPoint(e),
      point: getPoint(e),
      pressure: e.pressure || 0.5,
      shiftKey,
      ctrlKey,
      metaKey: isDarwin() ? metaKey : ctrlKey,
      altKey,
    };

    this.pointer = info;
    return info;
  }

  pointerMove(e: PointerEvent | React.PointerEvent, target = "") {
    const { shiftKey, ctrlKey, metaKey, altKey } = e;

    const prev = this.points[e.pointerId];

    const info = {
      ...prev,
      target,
      pointerId: e.pointerId,
      point: getPoint(e),
      pressure: e.pressure || 0.5,
      shiftKey,
      ctrlKey,
      metaKey: isDarwin() ? metaKey : ctrlKey,
      altKey,
    };

    if (this.points[e.pointerId]) {
      this.points[e.pointerId] = info;
    }

    this.pointer = info;

    return info;
  }

  pointerUp = (e: PointerEvent | React.PointerEvent, target = "") => {
    const { shiftKey, ctrlKey, metaKey, altKey } = e;

    const prev = this.points[e.pointerId];

    const info = {
      ...prev,
      target,
      origin: prev?.origin || getPoint(e),
      point: getPoint(e),
      pressure: e.pressure || 0.5,
      shiftKey,
      ctrlKey,
      metaKey: isDarwin() ? metaKey : ctrlKey,
      altKey,
    };

    delete this.points[e.pointerId];

    delete this.activePointerId;

    if (vec.dist(info.origin, info.point) < 8) {
      this.pointerUpTime = Date.now();
    }

    this.pointer = info;
    return info;
  };

  wheel = (e: WheelEvent) => {
    const { shiftKey, ctrlKey, metaKey, altKey } = e;
    return { point: getPoint(e), shiftKey, ctrlKey, metaKey, altKey };
  };

  pinch(e: TouchEvent | PointerEvent, point: number[], origin: number[]) {
    const { shiftKey, ctrlKey, altKey } = e;

    const delta = vec.sub(origin, point);

    const info = {
      origin,
      delta,
      point: vec.sub(vec.toPrecision(point), [0, 100]),
      pressure: 0.5,
      shiftKey,
      ctrlKey,
      altKey,
    };

    return info;
  }

  canAccept = (pointerId: PointerEvent["pointerId"]) => {
    return (
      this.activePointerId === undefined || this.activePointerId === pointerId
    );
  };

  isDoubleClick() {
    if (!this.pointer) return;

    const { origin, point } = this.pointer;

    return (
      Date.now() - this.pointerUpTime < DOUBLE_CLICK_DURATION &&
      vec.dist(origin, point) < 8
    );
  }

  clear() {
    this.activePointerId = undefined;
    this.pointer = undefined;
    this.points = {};
  }

  resetDoubleClick() {
    this.pointerUpTime = 0;
  }
}

const inputs = new Inputs();

export default inputs;
export function normalizeWheel(event: WheelEvent) {
  const { deltaY, deltaX } = event;

  let deltaZ = 0;

  if (event.ctrlKey || event.metaKey) {
    const signY = Math.sign(event.deltaY);
    const absDeltaY = Math.abs(event.deltaY);

    let dy = deltaY;

    if (absDeltaY > MAX_ZOOM_STEP) {
      dy = MAX_ZOOM_STEP * signY;
    }

    deltaZ = dy;
  }

  return [deltaX, deltaY, deltaZ];
}

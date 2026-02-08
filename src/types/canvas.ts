export interface Point {
  x: number;
  y: number;
}

export interface Card {
  id: string;
  src: string[];
}

export interface Camera {
  x: number;
  y: number;
  z: number;
}

export interface Counter {
  label: string; // e.g., "P/T", "loyalty", "charge", or any custom text
  // For P/T counters (power/toughness modifications)
  power?: number;
  toughness?: number;
  // For single-value counters (loyalty, charge, etc.)
  value?: number;
  color?: string; // optional custom color (hex format like "#FF0000")
}

export interface Shape {
  id: string;
  point: number[];
  size: number[];
  type: ShapeType;
  text?: string;
  src?: string[]; // some cards have multiple images (e.g. double faced cards)
  srcIndex: number; // index of the current image in the src array
  rotation?: number;
  isFlipped?: boolean;
  fontSize?: number;
  values?: [number, number]; // DEPRECATED - kept for backwards compatibility
  counters?: Counter[]; // NEW - supports multiple counter types
  color?: string;
}

export type ShapeType =
  | "rectangle"
  | "circle"
  | "arrow"
  | "text"
  | "image"
  | "token";

export type Mode = "select" | "create";

export const MAX_ZOOM_STEP = 5;

export function rotateShape(shape: Shape, angle: number): Shape {
  return {
    ...shape,
    rotation: (shape.rotation || 0) + angle,
  };
}

export function flipShape(shape: Shape): Shape {
  return {
    ...shape,
    isFlipped: !shape.isFlipped,
  };
}

export function intersect(rect1: DOMRect, rect2: DOMRect): boolean {
  if (rect1.right < rect2.left || rect2.right < rect1.left) return false;
  if (rect1.bottom < rect2.top || rect2.bottom < rect1.top) return false;
  return true;
}

export type ShortcutSection = {
  title: string;
  items: string[];
};

export type DragCardMeta = {
  id: string;
  src: string;
  faceDown: boolean;
};

export type HandDragState = DragCardMeta & {
  pointerId: number;
  clientX: number;
  clientY: number;
  target: HTMLElement | null;
};

export type DragPreview = DragCardMeta & {
  point: [number, number];
};

export type RandomEventType = "coin" | "d6" | "d20" | "starter";
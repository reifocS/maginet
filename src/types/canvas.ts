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
  values?: [number, number];
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
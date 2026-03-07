import { Shape } from "../../types/canvas";

export type EditableShapePropertyKey =
  | "point"
  | "size"
  | "rotation"
  | "isFlipped"
  | "text"
  | "fontSize"
  | "color";

export type PropertyEditorKind =
  | "text"
  | "multiline"
  | "number"
  | "color"
  | "boolean"
  | "list";

export type EditableShapePropertyDefinition = {
  key: EditableShapePropertyKey;
  label: string;
  fixedLength?: number;
  listLabels?: string[];
};

type EditableShapeValue = string | number | boolean | Array<string | number>;

const DEFAULT_SHAPE_COLOR: Partial<Record<Shape["type"], string>> = {
  text: "#000000",
  token: "#DCE1DE",
  rectangle: "#facc15",
  circle: "#facc15",
  arrow: "#facc15",
};

const DEFAULT_FONT_SIZE: Partial<Record<Shape["type"], number>> = {
  text: 16,
  token: 12,
};

const PROPERTIES_BY_SHAPE: Record<
  Shape["type"],
  EditableShapePropertyDefinition[]
> = {
  image: [
    { key: "point", label: "Position", fixedLength: 2, listLabels: ["X", "Y"] },
    { key: "size", label: "Size", fixedLength: 2, listLabels: ["W", "H"] },
    { key: "rotation", label: "Rotation" },
    { key: "isFlipped", label: "Flipped" },
  ],
  text: [
    { key: "text", label: "Text" },
    { key: "point", label: "Position", fixedLength: 2, listLabels: ["X", "Y"] },
    { key: "rotation", label: "Rotation" },
    { key: "fontSize", label: "Font Size" },
    { key: "color", label: "Color" },
  ],
  rectangle: [
    { key: "point", label: "Position", fixedLength: 2, listLabels: ["X", "Y"] },
    { key: "size", label: "Size", fixedLength: 2, listLabels: ["W", "H"] },
    { key: "rotation", label: "Rotation" },
    { key: "color", label: "Color" },
  ],
  token: [
    { key: "text", label: "Label" },
    { key: "point", label: "Position", fixedLength: 2, listLabels: ["X", "Y"] },
    { key: "size", label: "Size", fixedLength: 2, listLabels: ["W", "H"] },
    { key: "rotation", label: "Rotation" },
    { key: "fontSize", label: "Font Size" },
    { key: "color", label: "Fill" },
  ],
  circle: [
    { key: "point", label: "Position", fixedLength: 2, listLabels: ["X", "Y"] },
    { key: "size", label: "Size", fixedLength: 2, listLabels: ["W", "H"] },
    { key: "rotation", label: "Rotation" },
    { key: "color", label: "Color" },
  ],
  arrow: [
    { key: "point", label: "Position", fixedLength: 2, listLabels: ["X", "Y"] },
    { key: "size", label: "Size", fixedLength: 2, listLabels: ["W", "H"] },
    { key: "rotation", label: "Rotation" },
    { key: "color", label: "Color" },
  ],
};

export function getShapePropertyDefinitions(shape: Shape) {
  return PROPERTIES_BY_SHAPE[shape.type] ?? [];
}

export function isHexColorValue(value: string) {
  return /^#[0-9a-fA-F]{6}$/.test(value.trim());
}

export function normalizeHexColor(value: string, fallback: string) {
  const trimmed = value.trim();
  if (isHexColorValue(trimmed)) {
    return trimmed.toUpperCase();
  }

  if (/^[0-9a-fA-F]{6}$/.test(trimmed)) {
    return `#${trimmed.toUpperCase()}`;
  }

  return fallback;
}

export function inferPropertyEditorKind(
  key: EditableShapePropertyKey,
  value: EditableShapeValue
): PropertyEditorKind {
  if (Array.isArray(value)) {
    return "list";
  }

  if (key === "text") {
    return "multiline";
  }

  if (typeof value === "boolean") {
    return "boolean";
  }

  if (typeof value === "number") {
    return "number";
  }

  if (typeof value === "string" && (key === "color" || isHexColorValue(value))) {
    return "color";
  }

  return "text";
}

export function getResolvedShapePropertyValue(
  shape: Shape,
  key: EditableShapePropertyKey
): EditableShapeValue {
  switch (key) {
    case "point":
      return [
        Number(shape.point?.[0] ?? 0),
        Number(shape.point?.[1] ?? 0),
      ];
    case "size":
      return [
        Number(shape.size?.[0] ?? 0),
        Number(shape.size?.[1] ?? 0),
      ];
    case "rotation":
      return Number(shape.rotation ?? 0);
    case "isFlipped":
      return Boolean(shape.isFlipped);
    case "text":
      return shape.text ?? "";
    case "fontSize":
      return Number(shape.fontSize ?? DEFAULT_FONT_SIZE[shape.type] ?? 16);
    case "color":
      return shape.color ?? DEFAULT_SHAPE_COLOR[shape.type] ?? "#000000";
    default:
      return "";
  }
}

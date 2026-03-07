import { CardState } from "../hooks/useCardReducer";
import { Camera, Card, Counter, Mode, Shape, ShapeType } from "../types/canvas";

export const DEBUG_SNAPSHOT_KIND = "maginet/debug-snapshot";
export const DEBUG_SNAPSHOT_VERSION = 1;

const SHAPE_TYPES = new Set<ShapeType>([
  "rectangle",
  "circle",
  "arrow",
  "text",
  "image",
  "token",
]);

export type DebugSnapshot = {
  kind: typeof DEBUG_SNAPSHOT_KIND;
  version: typeof DEBUG_SNAPSHOT_VERSION;
  capturedAt: number;
  deckParam: string;
  cardState: CardState;
  shapes: Shape[];
  selectedShapeIds: string[];
  editingText: { id: string; text: string } | null;
  camera: Camera;
  mode: Mode;
  shapeType: ShapeType;
  isSnapEnabled: boolean;
  showCounterControls: boolean;
  selectedHandCardId: string | null;
  connectedPeerIds: string[];
  meta: {
    href?: string;
    peerId?: string;
    userAgent?: string;
    viewport?: {
      width: number;
      height: number;
    };
  };
};

export type DebugSnapshotImportResult =
  | { ok: true; snapshot: DebugSnapshot }
  | { ok: false; error: string };

export type DebugSnapshotApi = {
  exportSnapshot: () => DebugSnapshot;
  exportSnapshotText: () => string;
  importSnapshot: (input: string | DebugSnapshot) => DebugSnapshotImportResult;
};

export type CreateDebugSnapshotOptions = Omit<DebugSnapshot, "kind" | "version">;

declare global {
  interface Window {
    __MAGINET_DEBUG__?: DebugSnapshotApi;
  }
}

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const cloneCounter = (counter: Counter): Counter => ({ ...counter });

const cloneCard = (card: Card): Card => ({
  ...card,
  src: [...card.src],
});

const cloneCardState = (cardState: CardState): CardState => ({
  cards: cardState.cards.map(cloneCard),
  deck: cardState.deck.map(cloneCard),
  lastAction: cardState.lastAction,
  actionId: cardState.actionId,
});

const cloneShape = (shape: Shape): Shape => ({
  ...shape,
  point: [...shape.point],
  size: [...shape.size],
  src: shape.src ? [...shape.src] : undefined,
  values: shape.values ? [...shape.values] as [number, number] : undefined,
  counters: shape.counters?.map(cloneCounter),
});

const dedupeShapesById = (shapeList: Shape[]) => {
  const byId = new Map<string, Shape>();
  shapeList.forEach((shape) => {
    if (!shape || typeof shape !== "object" || typeof shape.id !== "string") {
      return;
    }
    byId.set(shape.id, cloneShape(shape));
  });
  return Array.from(byId.values());
};

const sanitizePointTuple = (value: unknown): [number, number] | null => {
  if (!Array.isArray(value) || value.length < 2) return null;
  if (!isFiniteNumber(value[0]) || !isFiniteNumber(value[1])) return null;
  return [value[0], value[1]];
};

const sanitizeCard = (value: unknown): Card | null => {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (typeof record.id !== "string" || !Array.isArray(record.src)) return null;
  const src = record.src.filter((entry): entry is string => typeof entry === "string");
  if (src.length !== record.src.length) return null;
  return { id: record.id, src };
};

const sanitizeCounter = (value: unknown): Counter | null => {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (typeof record.label !== "string") return null;

  const counter: Counter = { label: record.label };
  if (record.power !== undefined) {
    if (!isFiniteNumber(record.power)) return null;
    counter.power = record.power;
  }
  if (record.toughness !== undefined) {
    if (!isFiniteNumber(record.toughness)) return null;
    counter.toughness = record.toughness;
  }
  if (record.value !== undefined) {
    if (!isFiniteNumber(record.value)) return null;
    counter.value = record.value;
  }
  if (record.color !== undefined) {
    if (typeof record.color !== "string") return null;
    counter.color = record.color;
  }

  return counter;
};

const sanitizeShape = (value: unknown): Shape | null => {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const point = sanitizePointTuple(record.point);
  const size = sanitizePointTuple(record.size);
  if (!point || !size) return null;
  if (typeof record.id !== "string" || !SHAPE_TYPES.has(record.type as ShapeType)) {
    return null;
  }
  if (!isFiniteNumber(record.srcIndex)) return null;

  const shape: Shape = {
    id: record.id,
    point,
    size,
    type: record.type as ShapeType,
    srcIndex: record.srcIndex,
  };

  if (typeof record.text === "string") {
    shape.text = record.text;
  }
  if (Array.isArray(record.src)) {
    const src = record.src.filter((entry): entry is string => typeof entry === "string");
    if (src.length !== record.src.length) return null;
    shape.src = src;
  }
  if (record.rotation !== undefined) {
    if (!isFiniteNumber(record.rotation)) return null;
    shape.rotation = record.rotation;
  }
  if (record.isFlipped !== undefined) {
    if (typeof record.isFlipped !== "boolean") return null;
    shape.isFlipped = record.isFlipped;
  }
  if (record.fontSize !== undefined) {
    if (!isFiniteNumber(record.fontSize)) return null;
    shape.fontSize = record.fontSize;
  }
  if (record.values !== undefined) {
    const values = sanitizePointTuple(record.values);
    if (!values) return null;
    shape.values = values;
  }
  if (record.counters !== undefined) {
    if (!Array.isArray(record.counters)) return null;
    const counters = record.counters
      .map(sanitizeCounter)
      .filter((counter): counter is Counter => counter !== null);
    if (counters.length !== record.counters.length) return null;
    shape.counters = counters;
  }
  if (record.color !== undefined) {
    if (typeof record.color !== "string") return null;
    shape.color = record.color;
  }

  return shape;
};

const sanitizeCardState = (value: unknown): CardState | null => {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (!Array.isArray(record.cards) || !Array.isArray(record.deck)) return null;

  const cards = record.cards.map(sanitizeCard).filter((card): card is Card => card !== null);
  const deck = record.deck.map(sanitizeCard).filter((card): card is Card => card !== null);
  if (cards.length !== record.cards.length || deck.length !== record.deck.length) {
    return null;
  }

  return {
    cards,
    deck,
    lastAction: typeof record.lastAction === "string" ? record.lastAction : undefined,
    actionId: isFiniteNumber(record.actionId) ? record.actionId : undefined,
  };
};

const sanitizeEditingText = (value: unknown) => {
  if (value === null || value === undefined) return null;
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (typeof record.id !== "string" || typeof record.text !== "string") {
    return null;
  }
  return { id: record.id, text: record.text };
};

const sanitizeCamera = (value: unknown): Camera | null => {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (
    !isFiniteNumber(record.x) ||
    !isFiniteNumber(record.y) ||
    !isFiniteNumber(record.z)
  ) {
    return null;
  }
  return { x: record.x, y: record.y, z: record.z };
};

const sanitizeMeta = (value: unknown): DebugSnapshot["meta"] => {
  if (!value || typeof value !== "object") return {};
  const record = value as Record<string, unknown>;
  const viewportRecord =
    record.viewport && typeof record.viewport === "object"
      ? (record.viewport as Record<string, unknown>)
      : null;

  return {
    href: typeof record.href === "string" ? record.href : undefined,
    peerId: typeof record.peerId === "string" ? record.peerId : undefined,
    userAgent: typeof record.userAgent === "string" ? record.userAgent : undefined,
    viewport:
      viewportRecord &&
      isFiniteNumber(viewportRecord.width) &&
      isFiniteNumber(viewportRecord.height)
        ? { width: viewportRecord.width, height: viewportRecord.height }
        : undefined,
  };
};

export function createDebugSnapshot(
  options: CreateDebugSnapshotOptions
): DebugSnapshot {
  return {
    kind: DEBUG_SNAPSHOT_KIND,
    version: DEBUG_SNAPSHOT_VERSION,
    capturedAt: options.capturedAt,
    deckParam: options.deckParam,
    cardState: cloneCardState(options.cardState),
    shapes: dedupeShapesById(options.shapes),
    selectedShapeIds: [...options.selectedShapeIds],
    editingText: options.editingText ? { ...options.editingText } : null,
    camera: { ...options.camera },
    mode: options.mode,
    shapeType: options.shapeType,
    isSnapEnabled: options.isSnapEnabled,
    showCounterControls: options.showCounterControls,
    selectedHandCardId: options.selectedHandCardId,
    connectedPeerIds: [...options.connectedPeerIds],
    meta: {
      href: options.meta.href,
      peerId: options.meta.peerId,
      userAgent: options.meta.userAgent,
      viewport: options.meta.viewport ? { ...options.meta.viewport } : undefined,
    },
  };
}

export function serializeDebugSnapshot(snapshot: DebugSnapshot) {
  return JSON.stringify(snapshot, null, 2);
}

export function normalizeDebugSnapshot(value: unknown): DebugSnapshot | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;

  if (
    record.kind !== DEBUG_SNAPSHOT_KIND ||
    record.version !== DEBUG_SNAPSHOT_VERSION ||
    !isFiniteNumber(record.capturedAt) ||
    typeof record.deckParam !== "string"
  ) {
    return null;
  }

  const cardState = sanitizeCardState(record.cardState);
  const camera = sanitizeCamera(record.camera);
  const editingText = sanitizeEditingText(record.editingText);

  if (!cardState || !camera || !Array.isArray(record.shapes)) {
    return null;
  }
  if (editingText === null && record.editingText !== null && record.editingText !== undefined) {
    return null;
  }
  if (record.mode !== "select" && record.mode !== "create") return null;
  if (!SHAPE_TYPES.has(record.shapeType as ShapeType)) return null;
  if (typeof record.isSnapEnabled !== "boolean") return null;
  if (typeof record.showCounterControls !== "boolean") return null;
  if (
    record.selectedHandCardId !== null &&
    record.selectedHandCardId !== undefined &&
    typeof record.selectedHandCardId !== "string"
  ) {
    return null;
  }

  const shapes = record.shapes
    .map(sanitizeShape)
    .filter((shape): shape is Shape => shape !== null);
  if (shapes.length !== record.shapes.length) return null;

  return createDebugSnapshot({
    capturedAt: record.capturedAt,
    deckParam: record.deckParam,
    cardState,
    shapes,
    selectedShapeIds: Array.isArray(record.selectedShapeIds)
      ? record.selectedShapeIds.filter((id): id is string => typeof id === "string")
      : [],
    editingText,
    camera,
    mode: record.mode,
    shapeType: record.shapeType as ShapeType,
    isSnapEnabled: record.isSnapEnabled,
    showCounterControls: record.showCounterControls,
    selectedHandCardId:
      typeof record.selectedHandCardId === "string" ? record.selectedHandCardId : null,
    connectedPeerIds: Array.isArray(record.connectedPeerIds)
      ? record.connectedPeerIds.filter((id): id is string => typeof id === "string")
      : [],
    meta: sanitizeMeta(record.meta),
  });
}

export function parseDebugSnapshot(raw: string) {
  try {
    return normalizeDebugSnapshot(JSON.parse(raw));
  } catch {
    return null;
  }
}

import type { SyncChannelPlugin } from "@vescofire/peersync";
import type { Shape } from "../../types/canvas";
import { useShapeStore } from "../../hooks/useShapeStore";
import { setPeerShapes } from "./peerSyncState";

export const SHAPES_SYNC_CHANNEL_KEY = "shapes:v1";

export type ShapesByPeer = Record<string, Shape[]>;

export type ShapeListPatch = {
  upserts: Shape[];
  removedIds: string[];
  order: string[] | null;
};

export type ShapesPatch = {
  peerPatches: Array<{ peerId: string; patch: ShapeListPatch }>;
  removedPeerIds: string[];
};

export type ShapesSyncChannelOptions = {
  channelKey?: string;
  getLocalPeerId: () => string | null;
  getLocalShapes?: () => Shape[];
  subscribeLocalShapes?: (
    callback: (next: Shape[], prev: Shape[]) => void
  ) => () => void;
  setRemoteShapes?: (peerId: string, shapes: Shape[]) => void;
};

const isValidShape = (shape: unknown): shape is Shape => {
  if (!shape || typeof shape !== "object") return false;
  const candidate = shape as Record<string, unknown>;
  return typeof candidate.id === "string";
};

const normalizeShapes = (value: unknown): Shape[] => {
  if (!Array.isArray(value)) return [];
  return value.filter(isValidShape);
};

const normalizeShapesByPeer = (value: unknown): ShapesByPeer => {
  if (!value || typeof value !== "object") return {};

  const normalized: ShapesByPeer = {};
  Object.entries(value as Record<string, unknown>).forEach(([peerId, shapes]) => {
    if (!peerId) return;
    normalized[peerId] = normalizeShapes(shapes);
  });

  return normalized;
};

const areIdsEqual = (left: string[], right: string[]) => {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
};

const applyShapeListPatch = (base: Shape[], patch: ShapeListPatch): Shape[] => {
  const nextById = new Map(base.map((shape) => [shape.id, shape] as const));

  patch.removedIds.forEach((shapeId) => {
    nextById.delete(shapeId);
  });

  patch.upserts.forEach((shape) => {
    nextById.set(shape.id, shape);
  });

  if (!patch.order) {
    return Array.from(nextById.values());
  }

  const visited = new Set<string>();
  const ordered: Shape[] = [];

  patch.order.forEach((shapeId) => {
    if (visited.has(shapeId)) return;
    const shape = nextById.get(shapeId);
    if (!shape) return;
    visited.add(shapeId);
    ordered.push(shape);
  });

  nextById.forEach((shape, shapeId) => {
    if (visited.has(shapeId)) return;
    ordered.push(shape);
  });

  return ordered;
};

const diffShapeList = (prev: Shape[], next: Shape[]): ShapeListPatch | null => {
  const prevById = new Map(prev.map((shape) => [shape.id, shape] as const));
  const nextById = new Map(next.map((shape) => [shape.id, shape] as const));

  const upserts = next.filter((shape) => {
    const previous = prevById.get(shape.id);
    return !previous || previous !== shape;
  });

  const removedIds = prev
    .filter((shape) => !nextById.has(shape.id))
    .map((shape) => shape.id);

  const prevOrder = prev.map((shape) => shape.id);
  const nextOrder = next.map((shape) => shape.id);
  const order = areIdsEqual(prevOrder, nextOrder) ? null : nextOrder;

  if (upserts.length === 0 && removedIds.length === 0 && !order) {
    return null;
  }

  return {
    upserts,
    removedIds,
    order,
  };
};

const diffShapesByPeer = (prev: ShapesByPeer, next: ShapesByPeer): ShapesPatch | null => {
  const peerPatches: Array<{ peerId: string; patch: ShapeListPatch }> = [];
  const removedPeerIds = Object.keys(prev).filter((peerId) => !(peerId in next));

  Object.entries(next).forEach(([peerId, nextShapes]) => {
    const prevShapes = prev[peerId] ?? [];
    if (prevShapes === nextShapes) return;

    const patch = diffShapeList(prevShapes, nextShapes);
    if (!patch) return;
    peerPatches.push({ peerId, patch });
  });

  if (peerPatches.length === 0 && removedPeerIds.length === 0) {
    return null;
  }

  return {
    peerPatches,
    removedPeerIds,
  };
};

const applyShapesPatch = (base: ShapesByPeer, patch: ShapesPatch): ShapesByPeer => {
  let changed = false;
  const next: ShapesByPeer = { ...base };

  patch.removedPeerIds.forEach((peerId) => {
    if (!(peerId in next)) return;
    delete next[peerId];
    changed = true;
  });

  patch.peerPatches.forEach(({ peerId, patch: peerPatch }) => {
    const currentShapes = next[peerId] ?? [];
    const nextShapes = applyShapeListPatch(currentShapes, peerPatch);
    if (nextShapes === currentShapes) return;
    next[peerId] = nextShapes;
    changed = true;
  });

  return changed ? next : base;
};

const defaultChannelOptions: Omit<ShapesSyncChannelOptions, "getLocalPeerId"> = {
  getLocalShapes: () => useShapeStore.getState().shapes,
  subscribeLocalShapes: (callback) => {
    return useShapeStore.subscribe((state, prevState) => {
      if (state.shapes === prevState.shapes) return;
      callback(state.shapes, prevState.shapes);
    });
  },
  setRemoteShapes: (peerId, shapes) => {
    setPeerShapes(peerId, shapes);
  },
};

export const createShapesSyncChannel = (
  options: ShapesSyncChannelOptions
): SyncChannelPlugin<ShapesByPeer, ShapesPatch> => {
  const resolvedOptions = {
    ...defaultChannelOptions,
    ...options,
    channelKey: options.channelKey ?? SHAPES_SYNC_CHANNEL_KEY,
  } as Required<ShapesSyncChannelOptions>;

  let channelState: ShapesByPeer = {};
  let lastLocalPeerId: string | null = null;

  const withLocalShapes = (
    base: ShapesByPeer,
    localPeerId: string,
    localShapes: Shape[]
  ) => {
    let next = base;

    if (lastLocalPeerId && lastLocalPeerId !== localPeerId && lastLocalPeerId in next) {
      const rest = { ...next };
      delete rest[lastLocalPeerId];
      next = rest;
    }

    if (next[localPeerId] !== localShapes) {
      next = {
        ...next,
        [localPeerId]: localShapes,
      };
    }

    lastLocalPeerId = localPeerId;
    return next;
  };

  const syncLocalShapesIfPossible = () => {
    const localPeerId = resolvedOptions.getLocalPeerId();
    if (!localPeerId) return channelState;

    const localShapes = resolvedOptions.getLocalShapes();
    const nextState = withLocalShapes(channelState, localPeerId, localShapes);
    if (nextState !== channelState) {
      channelState = nextState;
    }

    return channelState;
  };

  return {
    key: options.channelKey ?? SHAPES_SYNC_CHANNEL_KEY,
    getState: syncLocalShapesIfPossible,
    subscribe: (callback) => {
      return resolvedOptions.subscribeLocalShapes((nextShapes, prevShapes) => {
        if (nextShapes === prevShapes) return;

        const localPeerId = resolvedOptions.getLocalPeerId();
        if (!localPeerId) return;

        const prevState = channelState;
        const nextState = withLocalShapes(prevState, localPeerId, nextShapes);
        if (nextState === prevState) return;

        channelState = nextState;
        callback(nextState, prevState);
      });
    },
    setState: (next, meta) => {
      if (meta.origin !== "remote") return;
      const fromPeerId = meta.fromPeerId;
      if (!fromPeerId) return;

      const remoteShapes = next[fromPeerId] ?? [];
      const previousRemoteShapes = channelState[fromPeerId];
      if (previousRemoteShapes === remoteShapes) return;

      channelState = {
        ...channelState,
        [fromPeerId]: remoteShapes,
      };
      resolvedOptions.setRemoteShapes(fromPeerId, remoteShapes);
    },
    diff: diffShapesByPeer,
    apply: applyShapesPatch,
    snapshot: (state) => state,
    hydrate: (raw) => normalizeShapesByPeer(raw),
  };
};

export const shapesPatchUtils = {
  diffShapeList,
  applyShapeListPatch,
  diffShapesByPeer,
  applyShapesPatch,
  normalizeShapesByPeer,
};

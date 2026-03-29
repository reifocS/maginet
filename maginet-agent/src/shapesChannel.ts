import type { SyncChannelPlugin, SyncPeerId } from "@vescofire/peersync";
import type { Shape } from "./state.js";

export type ShapesByPeer = Record<string, Shape[]>;

type ShapeListPatch = {
  upserts: Shape[];
  removedIds: string[];
  order: string[] | null;
};

type ShapesPatch = {
  peerPatches: Array<{ peerId: string; patch: ShapeListPatch }>;
  removedPeerIds: string[];
};

interface AgentShapesChannelOptions {
  getLocalPeerId: () => string | null;
  getLocalShapes?: () => Shape[];
  subscribeLocalShapes?: (cb: (next: Shape[], prev: Shape[]) => void) => () => void;
  onRemoteShapes?: (peerId: string, shapes: Shape[]) => void;
}

const isValidShape = (shape: unknown): shape is Shape => {
  if (!shape || typeof shape !== "object") return false;
  return typeof (shape as Record<string, unknown>).id === "string";
};

const normalizeShapes = (value: unknown): Shape[] => {
  if (!Array.isArray(value)) return [];
  return value.filter(isValidShape);
};

const normalizeShapesByPeer = (value: unknown): ShapesByPeer => {
  if (!value || typeof value !== "object") return {};
  const normalized: ShapesByPeer = {};
  for (const [peerId, shapes] of Object.entries(value as Record<string, unknown>)) {
    if (!peerId) continue;
    normalized[peerId] = normalizeShapes(shapes);
  }
  return normalized;
};

const areIdsEqual = (a: string[], b: string[]) => {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
};

const diffShapeList = (prev: Shape[], next: Shape[]): ShapeListPatch | null => {
  const prevById = new Map(prev.map((s) => [s.id, s]));
  const nextById = new Map(next.map((s) => [s.id, s]));
  const upserts = next.filter((s) => { const p = prevById.get(s.id); return !p || p !== s; });
  const removedIds = prev.filter((s) => !nextById.has(s.id)).map((s) => s.id);
  const prevOrder = prev.map((s) => s.id);
  const nextOrder = next.map((s) => s.id);
  const order = areIdsEqual(prevOrder, nextOrder) ? null : nextOrder;
  if (upserts.length === 0 && removedIds.length === 0 && !order) return null;
  return { upserts, removedIds, order };
};

const applyShapeListPatch = (base: Shape[], patch: ShapeListPatch): Shape[] => {
  const byId = new Map(base.map((s) => [s.id, s]));
  for (const id of patch.removedIds) byId.delete(id);
  for (const s of patch.upserts) byId.set(s.id, s);
  if (!patch.order) return Array.from(byId.values());
  const visited = new Set<string>();
  const ordered: Shape[] = [];
  for (const id of patch.order) {
    if (visited.has(id)) continue;
    const s = byId.get(id);
    if (!s) continue;
    visited.add(id);
    ordered.push(s);
  }
  byId.forEach((s, id) => { if (!visited.has(id)) ordered.push(s); });
  return ordered;
};

export function createShapesSyncChannel(
  options: AgentShapesChannelOptions
): SyncChannelPlugin<ShapesByPeer, ShapesPatch> {
  let channelState: ShapesByPeer = {};
  let lastLocalPeerId: string | null = null;

  const getLocalShapes = options.getLocalShapes ?? (() => []);
  const subscribeLocalShapes = options.subscribeLocalShapes;

  const withLocalShapes = (base: ShapesByPeer, localPeerId: string, shapes: Shape[]) => {
    let next = base;
    if (lastLocalPeerId && lastLocalPeerId !== localPeerId && lastLocalPeerId in next) {
      const rest = { ...next };
      delete rest[lastLocalPeerId];
      next = rest;
    }
    if (next[localPeerId] !== shapes) {
      next = { ...next, [localPeerId]: shapes };
    }
    lastLocalPeerId = localPeerId;
    return next;
  };

  const syncLocal = () => {
    const pid = options.getLocalPeerId();
    if (!pid) return channelState;
    const shapes = getLocalShapes();
    const next = withLocalShapes(channelState, pid, shapes);
    if (next !== channelState) channelState = next;
    return channelState;
  };

  return {
    key: "shapes:v1",
    getState: syncLocal,
    subscribe: subscribeLocalShapes
      ? (cb: (next: ShapesByPeer, prev: ShapesByPeer) => void) =>
          subscribeLocalShapes((next: Shape[], prev: Shape[]) => {
            if (next === prev) return;
            const pid = options.getLocalPeerId();
            if (!pid) return;
            const prevState = channelState;
            const nextState = withLocalShapes(prevState, pid, next);
            if (nextState === prevState) return;
            channelState = nextState;
            cb(nextState, prevState);
          })
      : undefined,
    setState: (
      next: ShapesByPeer,
      meta: { origin: "local" | "remote"; source?: "patch" | "snapshot"; fromPeerId?: SyncPeerId }
    ) => {
      if (meta.origin !== "remote") return;
      const fromPeerId = meta.fromPeerId;
      if (!fromPeerId) return;
      const remoteShapes = next[fromPeerId] ?? [];
      if (channelState[fromPeerId] === remoteShapes) return;
      channelState = { ...channelState, [fromPeerId]: remoteShapes };
      options.onRemoteShapes?.(fromPeerId, remoteShapes);
    },
    diff: (prev: ShapesByPeer, next: ShapesByPeer): ShapesPatch | null => {
      const peerPatches: ShapesPatch["peerPatches"] = [];
      const removedPeerIds = Object.keys(prev).filter((id) => !(id in next));
      for (const [peerId, nextShapes] of Object.entries(next)) {
        const prevShapes = prev[peerId] ?? [];
        if (prevShapes === nextShapes) continue;
        const patch = diffShapeList(prevShapes, nextShapes as Shape[]);
        if (patch) peerPatches.push({ peerId, patch });
      }
      if (peerPatches.length === 0 && removedPeerIds.length === 0) return null;
      return { peerPatches, removedPeerIds };
    },
    apply: (base: ShapesByPeer, patch: ShapesPatch): ShapesByPeer => {
      let changed = false;
      const next = { ...base };
      for (const id of patch.removedPeerIds) {
        if (id in next) { delete next[id]; changed = true; }
      }
      for (const { peerId, patch: p } of patch.peerPatches) {
        const current = next[peerId] ?? [];
        const updated = applyShapeListPatch(current, p);
        if (updated !== current) { next[peerId] = updated; changed = true; }
      }
      return changed ? next : base;
    },
    snapshot: (state: ShapesByPeer) => state,
    hydrate: (raw: unknown) => normalizeShapesByPeer(raw),
  };
}

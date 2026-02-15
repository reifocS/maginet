import type { SyncEnvelope } from "./envelope";

export type PeerSyncPayload = {
  connectedPeers: string[];
};

export type PeerSyncEnvelope = SyncEnvelope<"peer-sync", PeerSyncPayload>;

export const isPeerSyncEnvelope = (
  message: SyncEnvelope
): message is PeerSyncEnvelope => {
  if (message.type !== "peer-sync") return false;
  if (!message.payload || typeof message.payload !== "object") return false;

  const payload = message.payload as Record<string, unknown>;
  return (
    Array.isArray(payload.connectedPeers) &&
    payload.connectedPeers.every((peerId) => typeof peerId === "string")
  );
};

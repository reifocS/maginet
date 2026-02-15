export type SyncMessageType = string;

export type SyncMetadata = {
  version?: number;
  roomId?: string;
  from?: string;
  msgId?: string;
  ts?: number;
};

export interface SyncEnvelope<
  TType extends SyncMessageType = SyncMessageType,
  TPayload = unknown,
> {
  type: TType;
  payload: TPayload;
  meta?: SyncMetadata;
}

export const isSyncEnvelope = (value: unknown): value is SyncEnvelope => {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return typeof candidate.type === "string" && "payload" in candidate;
};

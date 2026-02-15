import type { SyncEnvelope, SyncMessageType } from "./envelope";

export type SyncMessageHandler = (
  message: SyncEnvelope,
  peerId: string
) => void;

type HandlerMap = Map<SyncMessageType, Set<SyncMessageHandler>>;

export const createSyncEventBus = () => {
  const handlersByType: HandlerMap = new Map();

  const subscribe = (type: SyncMessageType, handler: SyncMessageHandler) => {
    const existing = handlersByType.get(type) ?? new Set<SyncMessageHandler>();
    existing.add(handler);
    handlersByType.set(type, existing);

    return () => {
      const next = handlersByType.get(type);
      if (!next) return;
      next.delete(handler);
      if (next.size === 0) {
        handlersByType.delete(type);
      }
    };
  };

  const publish = (message: SyncEnvelope, peerId: string) => {
    const handlers = handlersByType.get(message.type);
    if (!handlers || handlers.size === 0) return;
    handlers.forEach((handler) => handler(message, peerId));
  };

  const clear = () => {
    handlersByType.clear();
  };

  return {
    subscribe,
    publish,
    clear,
  };
};

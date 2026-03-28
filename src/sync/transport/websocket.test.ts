import { describe, it, expect, vi, beforeEach } from "vitest";
import { createWebSocketTransport } from "./websocket";

// Mock WebSocket
class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  readyState = MockWebSocket.CONNECTING;
  url: string;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  sentMessages: string[] = [];

  constructor(url: string) {
    this.url = url;
  }

  send(data: string) {
    this.sentMessages.push(data);
  }

  close() {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.();
  }

  // Test helpers
  simulateOpen() {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.();
  }

  simulateMessage(data: string) {
    this.onmessage?.({ data });
  }

  simulateClose() {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.();
  }
}

describe("createWebSocketTransport", () => {
  // Shared container updated by the stub constructor so tests can access the
  // live WebSocket instance without aliasing `this` to a local variable.
  const wsRef: { current: MockWebSocket } = {
    current: new MockWebSocket("ws://placeholder"),
  };

  beforeEach(() => {
    vi.stubGlobal("WebSocket", class extends MockWebSocket {
      constructor(url: string) {
        super(url);
        // Assigning to a property does not alias `this` — no-this-alias compliant.
        wsRef.current = this as unknown as MockWebSocket;
      }
    });
  });

  it("creates a transport with the correct interface", () => {
    const transport = createWebSocketTransport({ url: "ws://localhost:3210" });
    expect(transport.start).toBeDefined();
    expect(transport.stop).toBeDefined();
    expect(transport.send).toBeDefined();
    expect(transport.broadcast).toBeDefined();
    expect(transport.onMessage).toBeDefined();
    expect(transport.peers).toBeDefined();
    expect(transport.localPeerId).toBeDefined();
  });

  it("connects on start and reports agent as peer", async () => {
    const transport = createWebSocketTransport({ url: "ws://localhost:3210" });

    // transport.start() synchronously calls `new WebSocket(...)`, which updates wsRef.current
    const startPromise = transport.start();
    wsRef.current.simulateOpen();
    await startPromise;

    expect(transport.peers()).toEqual(["agent"]);
  });

  it("sends JSON-serialized envelopes", async () => {
    const transport = createWebSocketTransport({ url: "ws://localhost:3210" });

    const startPromise = transport.start();
    wsRef.current.simulateOpen();
    await startPromise;

    const envelope = { type: "test", payload: { value: 1 } };
    transport.send("agent", envelope);

    expect(wsRef.current.sentMessages).toHaveLength(1);
    expect(JSON.parse(wsRef.current.sentMessages[0])).toEqual(envelope);
  });

  it("receives and deserializes messages", async () => {
    const transport = createWebSocketTransport({ url: "ws://localhost:3210" });

    const startPromise = transport.start();
    wsRef.current.simulateOpen();
    await startPromise;

    const received: unknown[] = [];
    transport.onMessage((_, msg) => received.push(msg));

    wsRef.current.simulateMessage(JSON.stringify({ type: "hello", payload: {} }));

    expect(received).toHaveLength(1);
    expect(received[0]).toEqual({ type: "hello", payload: {} });
  });

  it("calls onConnectionClose when socket closes", async () => {
    const onClose = vi.fn();
    const transport = createWebSocketTransport({ url: "ws://localhost:3210" });

    const startPromise = transport.start();
    wsRef.current.simulateOpen();
    await startPromise;

    transport.onConnectionClose!(onClose);
    wsRef.current.simulateClose();

    expect(onClose).toHaveBeenCalledWith("agent");
  });
});

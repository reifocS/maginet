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
  let mockWs: MockWebSocket;

  beforeEach(() => {
    mockWs = new MockWebSocket("ws://localhost:3210");
    vi.stubGlobal("WebSocket", class extends MockWebSocket {
      constructor(url: string) {
        super(url);
        mockWs = this;
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

    const startPromise = transport.start();
    mockWs.simulateOpen();
    await startPromise;

    expect(transport.peers()).toEqual(["agent"]);
  });

  it("sends JSON-serialized envelopes", async () => {
    const transport = createWebSocketTransport({ url: "ws://localhost:3210" });

    const startPromise = transport.start();
    mockWs.simulateOpen();
    await startPromise;

    const envelope = { type: "test", payload: { value: 1 } };
    transport.send("agent", envelope);

    expect(mockWs.sentMessages).toHaveLength(1);
    expect(JSON.parse(mockWs.sentMessages[0])).toEqual(envelope);
  });

  it("receives and deserializes messages", async () => {
    const transport = createWebSocketTransport({ url: "ws://localhost:3210" });

    const startPromise = transport.start();
    mockWs.simulateOpen();
    await startPromise;

    const received: unknown[] = [];
    transport.onMessage((_, msg) => received.push(msg));

    mockWs.simulateMessage(JSON.stringify({ type: "hello", payload: {} }));

    expect(received).toHaveLength(1);
    expect(received[0]).toEqual({ type: "hello", payload: {} });
  });

  it("calls onConnectionClose when socket closes", async () => {
    const onClose = vi.fn();
    const transport = createWebSocketTransport({ url: "ws://localhost:3210" });

    const startPromise = transport.start();
    mockWs.simulateOpen();
    await startPromise;

    transport.onConnectionClose!(onClose);
    mockWs.simulateClose();

    expect(onClose).toHaveBeenCalledWith("agent");
  });
});

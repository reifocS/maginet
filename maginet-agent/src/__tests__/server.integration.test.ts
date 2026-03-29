import { describe, it, expect, afterEach } from "vitest";
import { WebSocket } from "ws";
import { AgentWebSocketServer } from "../server.js";

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const waitFor = async (
  assertion: () => void,
  timeoutMs = 2000,
  pollMs = 10
) => {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try { assertion(); return; }
    catch { await wait(pollMs); }
  }
  assertion();
};

describe("AgentWebSocketServer", () => {
  let server: AgentWebSocketServer | null = null;

  afterEach(async () => {
    if (server) {
      await server.stop();
      server = null;
    }
  });

  it("starts and accepts a WebSocket connection", async () => {
    server = new AgentWebSocketServer({ port: 0 });
    const port = await server.start();

    const ws = new WebSocket(`ws://localhost:${port}`);
    await new Promise<void>((resolve) => ws.on("open", resolve));

    await waitFor(() => {
      expect(server!.isConnected()).toBe(true);
    });

    ws.close();
  });

  it("receives messages from browser client", async () => {
    server = new AgentWebSocketServer({ port: 0 });
    const port = await server.start();

    const received: unknown[] = [];
    server.onMessage((msg) => received.push(msg));

    const ws = new WebSocket(`ws://localhost:${port}`);
    await new Promise<void>((resolve) => ws.on("open", resolve));

    ws.send(JSON.stringify({ type: "test", payload: { value: 42 } }));

    await waitFor(() => {
      expect(received).toHaveLength(1);
      expect(received[0]).toEqual({ type: "test", payload: { value: 42 } });
    });

    ws.close();
  });

  it("sends messages to browser client", async () => {
    server = new AgentWebSocketServer({ port: 0 });
    const port = await server.start();

    const ws = new WebSocket(`ws://localhost:${port}`);
    await new Promise<void>((resolve) => ws.on("open", resolve));

    const received: unknown[] = [];
    ws.on("message", (data) => received.push(JSON.parse(data.toString())));

    server.send({ type: "hello", payload: { from: "agent" } });

    await waitFor(() => {
      expect(received).toHaveLength(1);
      expect(received[0]).toEqual({ type: "hello", payload: { from: "agent" } });
    });

    ws.close();
  });

  it("detects disconnection", async () => {
    server = new AgentWebSocketServer({ port: 0 });
    const port = await server.start();

    const ws = new WebSocket(`ws://localhost:${port}`);
    await new Promise<void>((resolve) => ws.on("open", resolve));

    await waitFor(() => expect(server!.isConnected()).toBe(true));

    ws.close();

    await waitFor(() => expect(server!.isConnected()).toBe(false));
  });
});

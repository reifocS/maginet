import { describe, it, expect, beforeEach } from "vitest";
import { createToolHandlers } from "../mcp.js";
import type { AgentServer } from "../mcp.js";
import { AgentGameState } from "../state.js";

const makeCard = (id: string) => ({ id, src: [`https://example.com/${id}.png`] });

// Minimal mock for server
const mockServer = () => {
  const sent: unknown[] = [];
  return {
    send: (msg: unknown) => { sent.push(msg); },
    isConnected: () => true,
    getSent: () => sent,
  };
};

describe("MCP tool handlers", () => {
  let state: AgentGameState;
  let server: ReturnType<typeof mockServer>;
  let handlers: ReturnType<typeof createToolHandlers>;

  beforeEach(() => {
    state = new AgentGameState();
    server = mockServer();
    handlers = createToolHandlers({
      state,
      server: server as unknown as AgentServer,
      visibility: "full",
      remoteShapes: {},
      remoteCardState: null,
      actionLog: [],
    });
  });

  it("getHand returns empty hand initially", async () => {
    const result = await handlers.getHand({});
    expect(result.content[0].text).toContain("[]");
  });

  it("drawCard draws a card and returns it", async () => {
    state.initializeDeck([makeCard("bolt")]);
    const result = await handlers.drawCard({});
    expect(result.content[0].text).toContain("bolt");
    expect(state.getHand()).toHaveLength(1);
  });

  it("drawCard fails on empty deck", async () => {
    const result = await handlers.drawCard({});
    expect(result.isError).toBe(true);
  });

  it("playCard plays a card from hand", async () => {
    state.initializeDeck([makeCard("bolt")]);
    state.drawCard();
    const cardId = state.getHand()[0].id;
    const result = await handlers.playCard({ cardId });
    expect(result.isError).toBeUndefined();
    expect(state.getHand()).toHaveLength(0);
    expect(state.getAgentShapes()).toHaveLength(1);
  });

  it("playCard fails when card not in hand", async () => {
    const result = await handlers.playCard({ cardId: "nope" });
    expect(result.isError).toBe(true);
  });

  it("tapCard toggles rotation on agent shape", async () => {
    state.initializeDeck([makeCard("bolt")]);
    state.drawCard();
    const cardId = state.getHand()[0].id;
    await handlers.playCard({ cardId });
    const shapeId = state.getAgentShapes()[0].id;

    await handlers.tapCard({ shapeId });
    expect(state.getAgentShapes()[0].rotation).toBe(90);

    await handlers.tapCard({ shapeId });
    expect(state.getAgentShapes()[0].rotation).toBe(0);
  });

  it("getGameState respects full visibility", async () => {
    state.initializeDeck([makeCard("a"), makeCard("b")]);
    state.drawCard();

    const result = await handlers.getGameState({});
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.agentDeckContents).toBeDefined();
    expect(parsed.agentDeckContents).toHaveLength(1);
  });

  it("getGameState respects fair visibility", async () => {
    state.initializeDeck([makeCard("a"), makeCard("b")]);
    state.drawCard();

    const fairHandlers = createToolHandlers({
      state,
      server: server as unknown as AgentServer,
      visibility: "fair",
      remoteShapes: {},
      remoteCardState: null,
      actionLog: [],
    });

    const result = await fairHandlers.getGameState({});
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.agentDeckContents).toBeUndefined();
  });

  it("mulligan shuffles hand back to deck", async () => {
    state.initializeDeck([makeCard("a"), makeCard("b"), makeCard("c")]);
    state.drawCard();
    state.drawCard();
    expect(state.getHand()).toHaveLength(2);

    await handlers.mulligan({});
    expect(state.getHand()).toHaveLength(0);
    expect(state.getDeckSize()).toBe(3);
  });

  it("getBoardState returns shapes", async () => {
    const boardHandlers = createToolHandlers({
      state,
      server: server as unknown as AgentServer,
      visibility: "full",
      remoteShapes: {
        "browser-peer": [
          { id: "s1", point: [0, 0], size: [100, 100], type: "image" as const, srcIndex: 0 },
        ],
      },
      remoteCardState: null,
      actionLog: [],
    });

    const result = await boardHandlers.getBoardState({});
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed["browser-peer"]).toHaveLength(1);
  });
});

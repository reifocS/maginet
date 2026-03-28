import { describe, it, expect, afterEach } from "vitest";
import { WebSocket } from "ws";
import { AgentWebSocketServer } from "../server.js";
import { AgentGameState } from "../state.js";
import { createToolHandlers } from "../mcp.js";
import type { Shape } from "../state.js";

describe("Agent E2E", () => {
  let server: AgentWebSocketServer | null = null;

  afterEach(async () => {
    if (server) { await server.stop(); server = null; }
  });

  it("agent loads deck, draws card, plays to board, taps card, observes state", async () => {
    // 1. Start agent server
    server = new AgentWebSocketServer({ port: 0 });
    const port = await server.start();

    // 2. Create game state and tool handlers
    const state = new AgentGameState();
    const remoteShapes: Record<string, Shape[]> = {};
    const handlers = createToolHandlers({
      state,
      server: server as unknown as AgentWebSocketServer,
      visibility: "full",
      remoteShapes,
      remoteCardState: null,
      actionLog: [],
    });

    // 3. Simulate browser connecting
    const browserReceived: unknown[] = [];
    const ws = new WebSocket(`ws://localhost:${port}`);
    await new Promise<void>((resolve) => ws.on("open", resolve));
    ws.on("message", (data) => browserReceived.push(JSON.parse(data.toString())));

    // 4. Initialize deck with pre-made cards (skip Scryfall)
    state.initializeDeck([
      { id: "card-1", src: ["https://example.com/bolt.png"] },
      { id: "card-2", src: ["https://example.com/mountain.png"] },
    ]);

    // 5. Draw a card
    const drawResult = await handlers.drawCard({});
    expect(drawResult.isError).toBeUndefined();
    expect(state.getHand()).toHaveLength(1);

    // 6. Play the card
    const cardId = state.getHand()[0].id;
    const playResult = await handlers.playCard({
      cardId,
      position: [300, 300],
    });
    expect(playResult.isError).toBeUndefined();
    expect(state.getHand()).toHaveLength(0);
    expect(state.getAgentShapes()).toHaveLength(1);

    // 7. Verify shape was created correctly
    const shape = state.getAgentShapes()[0];
    expect(shape.point).toEqual([300, 300]);
    expect(shape.type).toBe("image");
    expect(shape.src).toEqual(["https://example.com/bolt.png"]);
    expect(shape.isFlipped).toBe(false);

    // 8. Tap the card
    await handlers.tapCard({ shapeId: shape.id });
    expect(state.getAgentShapes()[0].rotation).toBe(90);

    // 9. Get game state
    const gameState = await handlers.getGameState({});
    const parsed = JSON.parse(gameState.content[0].text);
    expect(parsed.agentHand).toHaveLength(0);
    expect(parsed.agentDeckSize).toBe(1);
    expect(parsed.boardShapes.agent).toHaveLength(1);

    ws.close();
  });
});

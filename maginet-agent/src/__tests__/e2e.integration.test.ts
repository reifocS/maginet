import { describe, it, expect } from "vitest";
import { AgentGameState } from "../state.js";
import { createToolHandlers } from "../mcp.js";
import type { Shape } from "../state.js";
import type { AgentServer } from "../mcp.js";

const mockServer: AgentServer = {
  isConnected: () => true,
  send: () => {},
};

describe("Agent E2E", () => {
  it("agent loads deck, draws card, plays to board, taps card, observes state", async () => {
    const state = new AgentGameState();
    const remoteShapes: Record<string, Shape[]> = {};
    const handlers = createToolHandlers({
      state,
      server: mockServer,
      visibility: "full",
      remoteShapes,
      remoteCardState: null,
      actionLog: [],
    });

    state.initializeDeck([
      { id: "card-1", src: ["https://example.com/bolt.png"] },
      { id: "card-2", src: ["https://example.com/mountain.png"] },
    ]);

    const drawResult = await handlers.drawCard({});
    expect(drawResult.isError).toBeUndefined();
    expect(state.getHand()).toHaveLength(1);

    const cardId = state.getHand()[0].id;
    const playResult = await handlers.playCard({ cardId, position: [300, 300] });
    expect(playResult.isError).toBeUndefined();
    expect(state.getHand()).toHaveLength(0);
    expect(state.getAgentShapes()).toHaveLength(1);

    const shape = state.getAgentShapes()[0];
    expect(shape.point).toEqual([300, 300]);
    expect(shape.type).toBe("image");
    expect(shape.src).toEqual(["https://example.com/bolt.png"]);

    await handlers.tapCard({ shapeId: shape.id });
    expect(state.getAgentShapes()[0].rotation).toBe(90);

    const gameState = await handlers.getGameState({});
    const parsed = JSON.parse(gameState.content[0].text);
    expect(parsed.agentHand).toHaveLength(0);
    expect(parsed.agentDeckSize).toBe(1);
    expect(parsed.boardShapes.agent).toHaveLength(1);
  });
});

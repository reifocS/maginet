import { describe, it, expect } from "vitest";
import { filterGameState, type RawGameState } from "../visibility.js";

const makeCard = (id: string) => ({ id, src: [`https://example.com/${id}.png`] });
const makeShape = (id: string) => ({
  id,
  point: [0, 0],
  size: [100, 100],
  type: "image" as const,
  srcIndex: 0,
  src: [`https://example.com/${id}.png`],
});

const rawState: RawGameState = {
  agentHand: [makeCard("a1"), makeCard("a2")],
  agentDeck: [makeCard("d1"), makeCard("d2"), makeCard("d3")],
  boardShapes: { agent: [makeShape("s1")], opponent: [makeShape("s2")] },
  opponentHand: [makeCard("o1"), makeCard("o2"), makeCard("o3")],
  opponentHandCount: 3,
  opponentDeckSize: 10,
};

describe("filterGameState", () => {
  it("fair: shows agent hand, hides deck contents, hides opponent hand", () => {
    const result = filterGameState(rawState, "fair");
    expect(result.agentHand).toEqual(rawState.agentHand);
    expect(result.agentDeckSize).toBe(3);
    expect(result.agentDeckContents).toBeUndefined();
    expect(result.opponentHandCount).toBe(3);
    expect(result.opponentHandContents).toBeUndefined();
    expect(result.boardShapes).toEqual(rawState.boardShapes);
  });

  it("full: shows everything including deck contents and opponent hand", () => {
    const result = filterGameState(rawState, "full");
    expect(result.agentHand).toEqual(rawState.agentHand);
    expect(result.agentDeckSize).toBe(3);
    expect(result.agentDeckContents).toEqual(rawState.agentDeck);
    expect(result.opponentHandCount).toBe(3);
    expect(result.opponentHandContents).toEqual(rawState.opponentHand);
  });

  it("board shapes are always fully visible", () => {
    const fair = filterGameState(rawState, "fair");
    const full = filterGameState(rawState, "full");
    expect(fair.boardShapes).toEqual(full.boardShapes);
  });
});

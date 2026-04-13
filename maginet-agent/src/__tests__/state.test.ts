import { describe, it, expect, beforeEach } from "vitest";
import { AgentGameState } from "../state.js";

const makeCard = (id: string, src = [`https://example.com/${id}.png`]) => ({
  id,
  src,
});

describe("AgentGameState", () => {
  let state: AgentGameState;

  beforeEach(() => {
    state = new AgentGameState();
  });

  it("initializes with empty deck and hand", () => {
    expect(state.getHand()).toEqual([]);
    expect(state.getDeckSize()).toBe(0);
  });

  it("initializes a deck", () => {
    const cards = [makeCard("a"), makeCard("b"), makeCard("c")];
    state.initializeDeck(cards);
    expect(state.getDeckSize()).toBe(3);
    expect(state.getHand()).toEqual([]);
  });

  it("draws a card from deck to hand", () => {
    state.initializeDeck([makeCard("a"), makeCard("b")]);
    const drawn = state.drawCard();
    expect(drawn).toBeDefined();
    expect(state.getHand()).toHaveLength(1);
    expect(state.getDeckSize()).toBe(1);
  });

  it("returns null when drawing from empty deck", () => {
    const drawn = state.drawCard();
    expect(drawn).toBeNull();
  });

  it("mulligans hand back into deck", () => {
    state.initializeDeck([makeCard("a"), makeCard("b"), makeCard("c")]);
    state.drawCard();
    state.drawCard();
    expect(state.getHand()).toHaveLength(2);
    state.mulligan();
    expect(state.getHand()).toHaveLength(0);
    expect(state.getDeckSize()).toBe(3);
  });

  it("plays a card from hand and returns it", () => {
    state.initializeDeck([makeCard("a")]);
    state.drawCard();
    const hand = state.getHand();
    const cardId = hand[0].id;
    const played = state.playCard(cardId);
    expect(played).toBeDefined();
    expect(played!.src).toEqual(["https://example.com/a.png"]);
    expect(state.getHand()).toHaveLength(0);
  });

  it("returns null when playing a card not in hand", () => {
    const played = state.playCard("nonexistent");
    expect(played).toBeNull();
  });

  it("sends a card back to hand", () => {
    const card = makeCard("returned");
    state.sendToHand([card]);
    expect(state.getHand()).toHaveLength(1);
    expect(state.getHand()[0].src).toEqual(card.src);
  });

  it("sends a card to deck top", () => {
    state.initializeDeck([makeCard("a")]);
    state.sendToDeck([makeCard("top")], "top");
    expect(state.getDeckSize()).toBe(2);
    const drawn = state.drawCard();
    expect(drawn!.src).toEqual(["https://example.com/top.png"]);
  });

  it("sends a card to deck bottom", () => {
    state.initializeDeck([makeCard("a")]);
    state.sendToDeck([makeCard("bottom")], "bottom");
    expect(state.getDeckSize()).toBe(2);
    const drawn = state.drawCard();
    expect(drawn!.src).toEqual(["https://example.com/a.png"]);
  });

  it("shuffles the deck", () => {
    const cards = Array.from({ length: 20 }, (_, i) => makeCard(`card-${i}`));
    state.initializeDeck(cards);
    const before = state.getDeckContents().map((c) => c.id);
    state.shuffleDeck();
    const after = state.getDeckContents().map((c) => c.id);
    expect(after).not.toEqual(before);
  });

  it("tracks agent shapes", () => {
    expect(state.getAgentShapes()).toEqual([]);
    const shape = {
      id: "s1",
      point: [100, 200],
      size: [100, 100],
      type: "image" as const,
      srcIndex: 0,
      src: ["https://example.com/card.png"],
    };
    state.addAgentShape(shape);
    expect(state.getAgentShapes()).toHaveLength(1);
    state.removeAgentShape("s1");
    expect(state.getAgentShapes()).toEqual([]);
  });

  it("updates an agent shape", () => {
    const shape = {
      id: "s1",
      point: [100, 200],
      size: [100, 100],
      type: "image" as const,
      srcIndex: 0,
    };
    state.addAgentShape(shape);
    state.updateAgentShape("s1", { rotation: 90 });
    expect(state.getAgentShapes()[0].rotation).toBe(90);
  });

  it("exposes cardState for sync", () => {
    state.initializeDeck([makeCard("a")]);
    const cardState = state.getCardState();
    expect(cardState.deck).toHaveLength(1);
    expect(cardState.cards).toHaveLength(0);
  });
});

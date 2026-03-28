import type { Shape } from "./state.js";

export type Visibility = "fair" | "full";

export interface Card {
  id: string;
  src: string[];
}

export interface RawGameState {
  agentHand: Card[];
  agentDeck: Card[];
  boardShapes: Record<string, Shape[]>;
  opponentHand: Card[];
  opponentHandCount: number;
  opponentDeckSize: number;
}

export interface VisibleGameState {
  agentHand: Card[];
  agentDeckSize: number;
  agentDeckContents?: Card[];
  boardShapes: Record<string, Shape[]>;
  opponentHandCount: number;
  opponentHandContents?: Card[];
  opponentDeckSize: number;
}

export function filterGameState(
  raw: RawGameState,
  visibility: Visibility
): VisibleGameState {
  const base: VisibleGameState = {
    agentHand: raw.agentHand,
    agentDeckSize: raw.agentDeck.length,
    boardShapes: raw.boardShapes,
    opponentHandCount: raw.opponentHandCount || raw.opponentHand.length,
    opponentDeckSize: raw.opponentDeckSize,
  };

  if (visibility === "full") {
    base.agentDeckContents = raw.agentDeck;
    base.opponentHandContents = raw.opponentHand;
  }

  return base;
}

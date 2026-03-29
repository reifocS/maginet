import { useReducer } from "react";
import { Card } from "../types/canvas";
import { generateId, shuffle } from "../utils/math";
import { Datum, mapDataToCard } from "./useCards";

export type CardState = {
  cards: Card[];
  deck: Card[];
  lastAction?: string;
  lastPlayedSrcs?: string[][];
  actionId?: number;
};

export type CardAction =
  | { type: "INITIALIZE_DECK"; payload: Card[] }
  | { type: "DRAW_CARD" }
  | { type: "MULLIGAN" }
  | { type: "SEND_TO_HAND"; payload: Card[] }
  | {
      type: "SEND_TO_DECK";
      payload: { cards: Card[]; position: "top" | "bottom" };
    }
  | {
      type: "MOVE_HAND_TO_DECK";
      payload: { cardId: string; position: "top" | "bottom" };
    }
  | { type: "PLAY_CARD"; payload: string[] }
  | { type: "ADD_TO_HAND"; payload: Datum }
  | { type: "SHUFFLE_DECK" }
  | { type: "SET_STATE"; payload: CardState };

export function cardReducer(state: CardState, action: CardAction): CardState {
  if (action.type === "SET_STATE") {
    return {
      cards: action.payload.cards.map((card) => ({ ...card })),
      deck: action.payload.deck.map((card) => ({ ...card })),
      lastAction: action.payload.lastAction,
      actionId: action.payload.actionId,
    };
  }

  const baseState: CardState = {
    ...state,
    lastAction: action.type,
    actionId: (state.actionId ?? 0) + 1,
  };

  switch (action.type) {
    case "INITIALIZE_DECK":
      return { ...baseState, deck: action.payload, cards: [] };
    case "DRAW_CARD":
      if (state.deck.length === 0) return baseState;
      {
        const [drawnCard, ...remainingDeck] = state.deck;
        return {
          ...baseState,
          deck: remainingDeck,
          cards: [...state.cards, { ...drawnCard, id: generateId() }],
        };
      }
    case "MULLIGAN":
      return {
        ...baseState,
        deck: [...state.deck, ...state.cards],
        cards: [],
      };
    case "SEND_TO_HAND":
      return {
        ...baseState,
        cards: [...state.cards, ...action.payload],
      };
    case "SEND_TO_DECK":
      if (action.payload.position === "top") {
        return {
          ...baseState,
          deck: [...action.payload.cards, ...state.deck],
        };
      }
      return {
        ...baseState,
        deck: [...state.deck, ...action.payload.cards],
      };
    case "MOVE_HAND_TO_DECK": {
      const card = state.cards.find((c) => c.id === action.payload.cardId);
      if (!card) return baseState;
      const remainingCards = state.cards.filter(
        (c) => c.id !== action.payload.cardId
      );
      const nextDeck =
        action.payload.position === "top"
          ? [card, ...state.deck]
          : [...state.deck, card];
      return {
        ...baseState,
        cards: remainingCards,
        deck: nextDeck,
      };
    }
    case "PLAY_CARD": {
      const playedCards = state.cards.filter((card) => action.payload.includes(card.id));
      return {
        ...baseState,
        lastPlayedSrcs: playedCards.map((c) => c.src),
        cards: state.cards.filter((card) => !action.payload.includes(card.id)),
      };
    }
    case "SHUFFLE_DECK":
      return {
        ...baseState,
        deck: shuffle(state.deck),
      };
    case "ADD_TO_HAND":
      return {
        ...baseState,
        cards: [...state.cards, mapDataToCard(action.payload)],
        deck: removeFirst(state.deck, mapDataToCard(action.payload)),
      };
    default:
      return baseState;
  }
}

export function useCardReducer(initialState: CardState) {
  return useReducer(cardReducer, initialState);
}

function removeFirst(deck: Card[], card: Card) {
  const idx = deck.findIndex((p) => p.src[0] === card.src[0]);
  return deck.filter((_, i) => i !== idx);
}

import { useReducer } from "react";
import { Card } from "../types/canvas";
import { generateId, shuffle } from "../utils/math";
import { Datum, mapDataToCard } from "./useCards";

export type CardState = {
  hand: Card[];
  deck: Card[];
  lastAction?: string;
};

export type CardAction =
  | { type: "INITIALIZE_DECK"; payload: Card[] }
  | { type: "DRAW_CARD" }
  | { type: "MULLIGAN" }
  | { type: "PLAY_CARD"; payload: string } // Remove single card from hand
  | { type: "ADD_TO_HAND"; payload: Datum }
  | { type: "ADD_CARD_TO_HAND"; payload: Card } // Add specific card to hand
  | { type: "SHUFFLE_DECK" }
  | { type: "SEND_TO_TOP_OF_DECK"; payload: Card } // Send card to top of deck
  | { type: "SEND_TO_BOTTOM_OF_DECK"; payload: Card }; // Send card to bottom of deck

export function cardReducer(state: CardState, action: CardAction): CardState {
  const newState = { ...state, lastAction: action.type };
  
  switch (action.type) {
    case "INITIALIZE_DECK":
      return { 
        ...newState, 
        deck: action.payload, 
        hand: []
      };
      
    case "DRAW_CARD":
      if (state.deck.length === 0) return newState;
      {
        const [drawnCard, ...remainingDeck] = state.deck;
        return {
          ...newState,
          deck: remainingDeck,
          hand: [...state.hand, { ...drawnCard, id: generateId() }],
        };
      }
      
    case "MULLIGAN":
      return {
        ...newState,
        deck: [...state.deck, ...state.hand],
        hand: [],
      };
      
    case "PLAY_CARD":
      return {
        ...newState,
        hand: state.hand.filter((card) => card.id !== action.payload),
      };
      
    case "SHUFFLE_DECK":
      return {
        ...newState,
        deck: shuffle(state.deck),
      };
      
    case "ADD_TO_HAND":
      return {
        ...newState,
        hand: [...state.hand, mapDataToCard(action.payload)],
        deck: removeFirst(state.deck, mapDataToCard(action.payload)),
      };
      
    case "ADD_CARD_TO_HAND":
      return {
        ...newState,
        hand: [...state.hand, action.payload],
      };
      
    case "SEND_TO_TOP_OF_DECK":
      return {
        ...newState,
        deck: [action.payload, ...state.deck],
      };
      
    case "SEND_TO_BOTTOM_OF_DECK":
      return {
        ...newState,
        deck: [...state.deck, action.payload],
      };
      
    default:
      return newState;
  }
}

export function useCardReducer(initialState: CardState) {
  return useReducer(cardReducer, initialState);
}

function removeFirst(deck: Card[], card: Card) {
  const idx = deck.findIndex((p) => p.src[0] === card.src[0]);
  return deck.filter((_, i) => i !== idx);
}

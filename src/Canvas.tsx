import { useLocation } from "react-router-dom";
import toast from "react-hot-toast";
import useCards, {
  mapDataToCards,
  processRawText,
  fetchRelatedCards,
} from "./hooks/useCards";
import { useCardReducer } from "./hooks/useCardReducer";
import { DEFAULT_DECK } from "./DEFAULT_DECK";
import { TldrawCanvas } from "./TldrawCanvas";
import { Card } from "./types/canvas";
import { useEffect } from "react";
import "./SimpleCardPreview.css";

function Canvas() {
  // URL parameters for deck loading
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const d = params.get("deck");

  // Card data from API
  const { data } = useCards(
    Array.from(processRawText(d || DEFAULT_DECK.join("\n")))
  );

  // Card state management
  const [cardState, dispatch] = useCardReducer({
    hand: [],
    deck: [],
  });
  const { hand, deck } = cardState;

  // Initialize deck when data loads
  useEffect(() => {
    if (data) {
      const initializeDeck = async () => {
        const mainCards: Card[] = mapDataToCards(data);
        const relatedCards: Card[] = await fetchRelatedCards(data);
        const allCards = [...mainCards, ...relatedCards];
        
        dispatch({ type: "INITIALIZE_DECK", payload: allCards });
        toast(`Deck initialized with ${mainCards.length} main cards and ${relatedCards.length} related cards`);

        // Draw a few cards for testing
        setTimeout(() => {
          dispatch({ type: "DRAW_CARD" });
          dispatch({ type: "DRAW_CARD" });
          dispatch({ type: "DRAW_CARD" });
        }, 500);
      };
      
      initializeDeck();
    }
  }, [data, dispatch]);

  // Card actions
  const drawCard = () => {
    dispatch({ type: "DRAW_CARD" });
  };

  const mulligan = () => {
    dispatch({ type: "MULLIGAN" });
  };

  const onShuffleDeck = () => {
    dispatch({ type: "SHUFFLE_DECK" });
  };

  const playCardFromHand = (cardId: string) => {
    dispatch({ type: "PLAY_CARD", payload: cardId });
  };

  const addCardToHand = (cardData: Card) => {
    dispatch({ type: "ADD_CARD_TO_HAND", payload: cardData });
  };

  const sendToTopOfDeck = (cardData: Card) => {
    dispatch({ type: "SEND_TO_TOP_OF_DECK", payload: cardData });
  };

  const sendToBottomOfDeck = (cardData: Card) => {
    dispatch({ type: "SEND_TO_BOTTOM_OF_DECK", payload: cardData });
  };


  return (
    <TldrawCanvas
      cards={hand}
      deck={deck}
      drawCard={drawCard}
      mulligan={mulligan}
      onShuffleDeck={onShuffleDeck}
      playCardFromHand={playCardFromHand}
      addCardToHand={addCardToHand}
      sendToTopOfDeck={sendToTopOfDeck}
      sendToBottomOfDeck={sendToBottomOfDeck}
    />
  );
}

export default Canvas;
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
import { useEffect, useState } from "react";
import "./SimpleCardPreview.css";

function Canvas() {
  // URL parameters for deck loading
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const d = params.get("deck");

  // Process deck text to get card names with quantities
  const originalCardNames = Array.from(processRawText(d || DEFAULT_DECK.join("\n")));

  // Card data from API
  const { data, isLoading } = useCards(originalCardNames);

  // Card state management
  const [cardState, dispatch] = useCardReducer({
    hand: [],
    deck: [],
  });
  const { hand, deck } = cardState;

  // Related cards state (separate from deck)
  const [relatedCards, setRelatedCards] = useState<Card[]>([]);


  // Initialize deck when data loads
  useEffect(() => {
    if (data) {
      const initializeDeck = async () => {
        const mainCards: Card[] = mapDataToCards(data, originalCardNames);
        const fetchedRelatedCards: Card[] = await fetchRelatedCards(data);

        // Only main cards go in the drawable deck
        dispatch({ type: "INITIALIZE_DECK", payload: mainCards });

        // Related cards are stored separately for browser display only
        setRelatedCards(fetchedRelatedCards);

        toast(`Deck initialized with ${mainCards.length} main cards and ${fetchedRelatedCards.length} related cards`);
      };

      initializeDeck();
    }
  }, [data, dispatch, originalCardNames]);

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
      relatedCards={relatedCards}
      isLoading={isLoading}
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
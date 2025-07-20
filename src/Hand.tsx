import * as React from "react";
import { Card } from "./types/canvas";

interface HandProps {
  cards: Card[];
  setHoveredCard: React.Dispatch<React.SetStateAction<string | null>>;
}

export default function Hand({ cards, setHoveredCard }: HandProps) {
  return (
    <div 
      className="hand"
      onMouseLeave={() => {
        // Fallback cleanup when mouse leaves the entire hand container
        setHoveredCard(null);
      }}
    >
      {cards.map((card) => (
        <img
          key={card.id}
          src={card.src[0]}
          alt={`Card ${card.id}`}
          draggable
          onDragStart={(e) => e.dataTransfer.setData("text/plain", card.id)}
          onMouseEnter={() => setHoveredCard(card.src[0])}
          onMouseLeave={() => setHoveredCard(null)}
        />
      ))}
    </div>
  );
}

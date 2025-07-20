import { useEditor } from 'tldraw';
import React from 'react';
import { Card } from './types/canvas';
import { MTGCardShape } from './shapes/MTGCardShape';
import './Canvas.css';

interface TldrawHandProps {
  cards: Card[];
  setHoveredCard?: (card: string | null) => void;
  playCardFromHand?: (cardId: string) => void;
}

export function TldrawHand({ cards, playCardFromHand }: TldrawHandProps) {
  const editor = useEditor();

  // Use global preview system for consistency - show immediately on hover
  const showCardPreview = (cardSrc: string) => {
    if (cardSrc) {
      const preview = document.getElementById('simple-card-preview');
      const img = preview?.querySelector('img');
      if (preview && img) {
        img.src = cardSrc;
        preview.classList.add('visible');
      }
    }
  };

  const hideCardPreview = () => {
    const preview = document.getElementById('simple-card-preview');
    if (preview) {
      preview.classList.remove('visible');
    }
  };

  // Cleanup on unmount
  React.useEffect(() => {
    return () => {
      hideCardPreview();
    };
  }, []);

  const playCardToCanvas = (card: Card) => {
    const viewportCenter = editor.getViewportScreenCenter();

    editor.createShape<MTGCardShape>({
      type: 'mtg-card',
      x: viewportCenter.x - 90,
      y: viewportCenter.y - 125,
      props: {
        w: 180,
        h: 251,
        src: card.src || [],
        srcIndex: card.srcIndex || 0,
        isFlipped: false,
        cardName: card.name || 'Magic Card',
      },
    });

    // Move card from hand to battlefield
    playCardFromHand?.(card.id);
  };

  if (cards.length === 0) {
    return null;
  }

  return (
    <div 
      className="hand-container"
      onMouseLeave={() => {
        // Fallback cleanup when mouse leaves the entire hand container
        hideCardPreview();
      }}
      style={{
        position: 'absolute',
        bottom: '20px',
        left: '20px',
        right: '320px', // Leave space for the game panel
        height: '120px',
        background: 'rgba(0, 0, 0, 0.8)',
        backdropFilter: 'blur(12px)',
        borderRadius: '12px',
        padding: '12px',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        overflowX: 'auto',
        zIndex: 100, // Lower z-index to not block canvas controls
        pointerEvents: 'auto', // Ensure the hand can still receive clicks
        contain: 'layout style paint', // Isolate from canvas
        willChange: 'auto',
      }}>
      <div style={{
        color: 'white',
        fontSize: '14px',
        fontWeight: '600',
        marginRight: '12px',
        whiteSpace: 'nowrap',
      }}>
        Hand ({cards.length})
      </div>
      
      {cards.map((card, index) => (
        <div
          key={index}
          draggable
          onClick={() => playCardToCanvas(card)}
          onDragStart={(e) => {
            // Clear any existing data and only set our specific data
            e.dataTransfer.clearData();
            e.dataTransfer.setData('application/json', JSON.stringify({
              type: 'mtg-card',
              cardId: card.id,
              cardData: card
            }));
            // Set a custom identifier to distinguish our drops
            e.dataTransfer.setData('text/mtg-card-drop', card.id);
            e.dataTransfer.effectAllowed = 'move';
            e.currentTarget.style.cursor = 'grabbing';
          }}
          onDragEnd={(e) => {
            e.currentTarget.style.cursor = 'grab';
          }}
          className="hand-card"
          style={{
            cursor: 'grab',
            borderRadius: '8px',
            overflow: 'hidden',
            border: '2px solid rgba(255, 255, 255, 0.2)',
            transition: 'transform 0.2s ease, box-shadow 0.2s ease',
            minWidth: '70px',
            height: '96px',
            position: 'relative',
            zIndex: 100,
          }}
          onMouseEnter={() => {
            const cardSrc = card.src?.[card.srcIndex || 0];
            if (cardSrc) {
              showCardPreview(cardSrc);
            }
          }}
          onMouseLeave={() => {
            hideCardPreview();
          }}
        >
          <img
            src={card.src?.[card.srcIndex || 0]}
            alt={card.name || 'Magic Card'}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              display: 'block',
            }}
          />
          <div style={{
            position: 'absolute',
            bottom: '4px',
            left: '4px',
            right: '4px',
            background: 'rgba(0, 0, 0, 0.8)',
            color: 'white',
            fontSize: '10px',
            fontWeight: '500',
            padding: '2px 4px',
            borderRadius: '4px',
            textAlign: 'center',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {card.name || 'Magic Card'}
          </div>
        </div>
      ))}
    </div>
  );
}
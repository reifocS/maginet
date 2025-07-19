import { useEditor } from 'tldraw';
import React, { useRef } from 'react';
import { Card } from './types/canvas';
import { MTGCardShape } from './shapes/MTGCardShape';
import './Canvas.css';

interface TldrawHandProps {
  cards: Card[];
  setHoveredCard?: (card: string | null) => void;
  playCardFromHand?: (cardId: string) => void;
}

export function TldrawHand({ cards, setHoveredCard, playCardFromHand }: TldrawHandProps) {
  const editor = useEditor();
  const zoomedCardRef = useRef<HTMLDivElement>(null);
  const currentCardSrc = useRef<string | null>(null);

  // Check if Ctrl key is pressed
  const isCtrlPressed = useRef(false);

  // Direct DOM manipulation to avoid React re-renders
  const showZoomedCard = (cardSrc: string) => {
    currentCardSrc.current = cardSrc;
    if (zoomedCardRef.current && isCtrlPressed.current) {
      const img = zoomedCardRef.current.querySelector('img') as HTMLImageElement;
      if (img) {
        img.src = cardSrc;
        zoomedCardRef.current.style.display = 'block';
      }
    }
  };

  const hideZoomedCard = () => {
    currentCardSrc.current = null;
    if (zoomedCardRef.current) {
      zoomedCardRef.current.style.display = 'none';
    }
  };

  const updateZoomedCardVisibility = () => {
    if (zoomedCardRef.current) {
      if (isCtrlPressed.current && currentCardSrc.current) {
        const img = zoomedCardRef.current.querySelector('img') as HTMLImageElement;
        if (img) {
          img.src = currentCardSrc.current;
          zoomedCardRef.current.style.display = 'block';
        }
      } else {
        zoomedCardRef.current.style.display = 'none';
      }
    }
  };

  // Listen for Ctrl key events and expose globally
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Control' || e.ctrlKey) {
        isCtrlPressed.current = true;
        (window as any).isCtrlPressed = true; // Expose globally for canvas cards
        updateZoomedCardVisibility();
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Control' || !e.ctrlKey) {
        isCtrlPressed.current = false;
        (window as any).isCtrlPressed = false; // Expose globally for canvas cards
        updateZoomedCardVisibility();
        // Hide canvas card preview when Ctrl is released
        const canvasPreview = document.getElementById('canvas-card-preview');
        if (canvasPreview) {
          canvasPreview.style.display = 'none';
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
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
        rotation: 0,
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
              showZoomedCard(cardSrc);
            }
          }}
          onMouseLeave={() => {
            hideZoomedCard();
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
      
      {/* Zoomed card preview - controlled via direct DOM manipulation */}
      <div 
        ref={zoomedCardRef}
        className="zoomed-card"
        style={{ 
          display: 'none',
          pointerEvents: 'none',
          position: 'fixed',
          bottom: '160px', // Position above the hand container (which is 120px + 20px margin + 20px buffer)
          right: '20px',
          height: '400px', // Smaller height to fit better
          width: '280px', // Fixed width based on Magic card aspect ratio
          border: '2px solid black',
          backgroundColor: 'white',
          zIndex: 1000,
          boxShadow: '0 4px 8px rgba(0, 0, 0, 0.2)',
        }}
      >
        <img
          src=""
          alt="Zoomed card"
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
          }}
        />
      </div>
    </div>
  );
}
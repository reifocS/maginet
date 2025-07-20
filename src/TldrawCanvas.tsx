import React from 'react';
import {
  Tldraw,
  createTLStore,
  defaultShapeUtils,
  useEditor,
} from 'tldraw';
import 'tldraw/tldraw.css';
import { MTGCardShapeUtil, MTGCardShape } from './shapes/MTGCardShape';
import { MTGGamePanel } from './MTGGamePanel';
import { TldrawHand } from './TldrawHand';
import { MTGContextMenu } from './MTGContextMenu';
import { Card } from './types/canvas';

interface TldrawCanvasProps {
  cards: Card[]; // hand
  deck: Card[];
  drawCard: () => void;
  mulligan: () => void;
  onShuffleDeck: () => void;
  playCardFromHand: (cardId: string) => void;
  addCardToHand: (cardData: Card) => void;
  setHoveredCard: (card: string | null) => void;
  setUseTldraw: (useTldraw: boolean) => void;
}

// Create custom shape utilities
const customShapeUtils = [
  MTGCardShapeUtil,
];

// Combine default shapes with custom MTG shapes
const shapeUtils = [...defaultShapeUtils, ...customShapeUtils];

// Component to handle card preview using tldraw's editor events
function TldrawCardPreview() {
  const editor = useEditor();
  const [isCtrlPressed, setIsCtrlPressed] = React.useState(false);

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Control' || e.ctrlKey) {
        setIsCtrlPressed(true);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Control' || !e.ctrlKey) {
        setIsCtrlPressed(false);
        // Hide preview when Ctrl is released
        const preview = document.getElementById('simple-card-preview');
        if (preview) {
          preview.classList.remove('visible');
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

  React.useEffect(() => {
    if (!isCtrlPressed) return;

    const handleMouseMove = (e: MouseEvent) => {
      // Convert screen coordinates to page coordinates
      const screenPoint = { x: e.clientX, y: e.clientY };
      const pagePoint = editor.screenToPage(screenPoint);
      const shapeAtPoint = editor.getShapeAtPoint(pagePoint);

      if (shapeAtPoint && shapeAtPoint.type === 'mtg-card') {
        const cardProps = shapeAtPoint.props as MTGCardShape['props'];
        const cardSrc = cardProps.src[cardProps.srcIndex] || '';
        console.log('🎯 Found MTG card under pointer:', cardSrc);

        if (cardSrc) {
          const preview = document.getElementById('simple-card-preview');
          const img = preview?.querySelector('img');
          if (preview && img) {
            img.src = cardSrc;
            preview.classList.add('visible');
          }
        }
      } else {
        // No card under pointer, hide preview
        const preview = document.getElementById('simple-card-preview');
        if (preview) {
          preview.classList.remove('visible');
        }
      }
    };

    const handleMouseLeave = () => {
      // Hide preview when mouse leaves the document
      const preview = document.getElementById('simple-card-preview');
      if (preview) {
        preview.classList.remove('visible');
      }
    };

    // Use global mousemove but with proper coordinate conversion
    window.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseleave', handleMouseLeave);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, [editor, isCtrlPressed]);

  return null; // This component doesn't render anything
}

// Component to handle drag and drop inside Tldraw
function TldrawDropHandler({ playCardFromHand }: { playCardFromHand: (cardId: string) => void }) {
  const editor = useEditor();


  React.useEffect(() => {
    const handleDrop = (e: DragEvent) => {
      // Check if this is our MTG card drop
      const mtgCardId = e.dataTransfer?.getData('text/mtg-card-drop');
      if (!mtgCardId) {
        return; // Not our drop, let tldraw handle it
      }

      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();

      try {
        const data = JSON.parse(e.dataTransfer?.getData('application/json') || '{}');
        if (data.type === 'mtg-card' && data.cardData) {
          const card = data.cardData;

          // Get the current screen point where the drop occurred
          const screenPoint = { x: e.clientX, y: e.clientY };

          // Convert to page coordinates
          const pagePoint = editor.screenToPage(screenPoint);

          // Create the card shape at the drop position
          editor.createShape<MTGCardShape>({
            type: 'mtg-card',
            x: pagePoint.x - 90,
            y: pagePoint.y - 125,
            props: {
              w: 180,
              h: 251,
              src: card.src || [],
              srcIndex: card.srcIndex || 0,
              isFlipped: false,
              cardName: card.name || 'Magic Card',
            },
          });

          // Remove card from hand
          playCardFromHand(card.id);
        }
      } catch (error) {
        console.error('Error parsing drop data:', error);
      }
    };

    const handleDragOver = (e: DragEvent) => {
      // Check if this is our MTG card drag
      const types = Array.from(e.dataTransfer?.types || []);
      if (types.includes('text/mtg-card-drop')) {
        e.preventDefault();
        e.stopPropagation();
        if (e.dataTransfer) {
          e.dataTransfer.dropEffect = 'move';
        }
      }
    };

    // Get the canvas element and add listeners
    const canvasElement = editor.getContainer();
    if (canvasElement) {
      // Use capture phase to intercept events before tldraw processes them
      canvasElement.addEventListener('drop', handleDrop, true);
      canvasElement.addEventListener('dragover', handleDragOver, true);

      return () => {
        canvasElement.removeEventListener('drop', handleDrop, true);
        canvasElement.removeEventListener('dragover', handleDragOver, true);
      };
    }
  }, [editor, playCardFromHand]);

  return null; // This component doesn't render anything
}

export const TldrawCanvas = React.memo(function TldrawCanvas({
  cards,
  deck,
  drawCard,
  mulligan,
  onShuffleDeck,
  playCardFromHand,
  addCardToHand,
  setHoveredCard,
  setUseTldraw
}: TldrawCanvasProps): JSX.Element {

  // Create store with custom shapes
  const store = React.useMemo(() => {
    return createTLStore({
      shapeUtils,
    });
  }, []);


  return (
    <div style={{ position: 'absolute', inset: 0, top: 0, left: 0, right: 0, bottom: 0 }}>
      <Tldraw
        store={store}
        shapeUtils={shapeUtils}
        components={{
          ContextMenu: () => <MTGContextMenu addCardToHand={addCardToHand} />,
        }}
      >
        <TldrawDropHandler playCardFromHand={playCardFromHand} />
        <TldrawCardPreview />
        <MTGGamePanel
          deck={deck}
          drawCard={drawCard}
          mulligan={mulligan}
          onShuffleDeck={onShuffleDeck}
        />

        <TldrawHand
          cards={cards}
          setHoveredCard={setHoveredCard}
          playCardFromHand={playCardFromHand}
        />

        {/* Add toggle button to switch back */}
        <button
          onClick={() => setUseTldraw(false)}
          style={{
            position: 'fixed',
            top: '10px',
            left: '10px',
            zIndex: 1000,
            padding: '8px 16px',
            backgroundColor: '#f0f0f0',
            border: '1px solid #ccc',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          Switch to Old Canvas
        </button>
      </Tldraw>

      {/* Global card preview element */}
      <div id="simple-card-preview" className="simple-card-preview">
        <img src="" alt="Card preview" />
      </div>
    </div>
  );
});
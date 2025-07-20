import React from 'react';
import {
  Tldraw,
  useEditor,
  AssetRecordType,
} from 'tldraw';
import { useSyncDemo } from '@tldraw/sync';
import 'tldraw/tldraw.css';
import { MTGGamePanel } from './MTGGamePanel';
import { TldrawHand } from './TldrawHand';
import { MTGContextMenu } from './MTGContextMenu';
import { Card } from './types/canvas';
import { usePeerStore } from './hooks/usePeerConnection';

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

      if (shapeAtPoint && shapeAtPoint.type === 'image') {
        const cardSrc = (shapeAtPoint.props as any).url || '';
        console.log('🎯 Found card image under pointer:', cardSrc);

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

          // Create the card using built-in image shape
          const cardImageUrl = card.src?.[card.srcIndex || 0];
          console.log('🎯 Dropping card to canvas:', { card, cardImageUrl });
          
          if (cardImageUrl) {
            try {
              // Create asset ID first
              const assetId = AssetRecordType.createId();
              
              // Create the asset
              editor.createAssets([
                {
                  id: assetId,
                  type: 'image',
                  typeName: 'asset',
                  props: {
                    name: card.name || 'Magic Card',
                    src: cardImageUrl,
                    w: 180,
                    h: 251,
                    mimeType: 'image/jpeg',
                    isAnimated: false,
                  },
                  meta: {},
                },
              ]);

              // Create the image shape with MTG card metadata
              editor.createShape({
                type: 'image',
                x: pagePoint.x - 90,
                y: pagePoint.y - 125,
                props: {
                  assetId: assetId,
                  w: 180,
                  h: 251,
                },
                meta: {
                  isMTGCard: true,
                  cardName: card.name,
                  cardSrc: card.src,
                  cardSrcIndex: card.srcIndex || 0,
                  originalCardId: card.id,
                },
              });

              console.log('✅ Dropped card shape created with asset:', assetId);
            } catch (error) {
              console.error('❌ Failed to create dropped card shape:', error);
            }
          } else {
            console.error('❌ No card image URL found for dropped card:', card);
          }

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

  // Get peer connection info for room ID
  const { peer } = usePeerStore();
  
  // Room ID state - can be changed by user
  const [roomId, setRoomId] = React.useState(() => {
    // Generate initial room ID based on peer connection
    if (peer?.id) {
      return `mtg-game-${peer.id}`;
    }
    return 'mtg-game-default';
  });

  // Update room ID when peer changes (only if still using default)
  React.useEffect(() => {
    if (peer?.id && roomId === 'mtg-game-default') {
      setRoomId(`mtg-game-${peer.id}`);
    }
  }, [peer?.id, roomId]);

  // Use Tldraw's built-in sync for multiplayer - keep it simple
  const store = useSyncDemo({
    roomId,
  });


  return (
    <div style={{ position: 'absolute', inset: 0, top: 0, left: 0, right: 0, bottom: 0 }}>
      <Tldraw
        store={store}
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
          roomId={roomId}
          onRoomIdChange={setRoomId}
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
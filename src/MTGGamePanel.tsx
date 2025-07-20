import { useState } from 'react';
import { useEditor, AssetRecordType } from 'tldraw';
import { useLocation, Form } from "react-router-dom";
import toast from "react-hot-toast";
import useModal from "./hooks/useModal";
import { usePeerStore } from "./hooks/usePeerConnection";
import { useRateLimit } from "./hooks/useRateLimit";
import useCards, { Datum } from "./hooks/useCards";
import { Card } from './types/canvas';

interface MTGGamePanelProps {
  deck: Card[];
  drawCard: () => void;
  mulligan: () => void;
  onShuffleDeck: () => void;
  roomId: string;
  onRoomIdChange: (newRoomId: string) => void;
}

export function MTGGamePanel({ deck, drawCard, mulligan, onShuffleDeck, roomId, onRoomIdChange }: MTGGamePanelProps) {
  const editor = useEditor();

  // Peer connection state
  const connectToPeer = usePeerStore((state) => state.connectToPeer);
  const sendMessage = usePeerStore((state) => state.sendMessage);
  const peer = usePeerStore((state) => state.peer);
  const connections = usePeerStore((state) => state.connections);
  const [peerId, setPeerId] = useState("");
  const [customRoomId, setCustomRoomId] = useState("");

  // Modal state
  const [modal, showModal] = useModal();

  // Deck and cards state
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const d = params.get("deck");

  const popularCards = [
    "Lightning Bolt", "Counterspell", "Sol Ring", "Command Tower", "Path to Exile",
    "Swords to Plowshares", "Dark Ritual", "Giant Growth", "Brainstorm", "Ponder",
    "Llanowar Elves", "Birds of Paradise", "Shock", "Cancel", "Divination"
  ];
  const { data } = useCards(popularCards);
  const relatedCards: Datum[] = [];

  const prouton = () => {
    sendMessage({ type: "prouton", payload: "Prouton!" });
  };
  const { rateLimitedFn: rateLimitedProuton, canCall: canCallProuton } =
    useRateLimit(prouton, {
      maxCalls: 30,
      timeWindow: 60000,
    });

  const allCards = data ? [...data, ...(relatedCards ?? [])] : [];

  // Create card on canvas using built-in image shape
  const createCardOnCanvas = (cardData: Datum) => {
    const viewportCenter = editor.getViewportScreenCenter();
    const imageUrl = cardData.image_uris?.normal;

    console.log('🎯 Creating card from search:', { cardData, imageUrl });

    if (imageUrl) {
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
              name: cardData.name,
              src: imageUrl,
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
          x: viewportCenter.x - 90,
          y: viewportCenter.y - 125,
          props: {
            assetId: assetId,
            w: 180,
            h: 251,
          },
          meta: {
            isMTGCard: true,
            cardName: cardData.name,
            cardSrc: [imageUrl],
            cardSrcIndex: 0,
            originalCardId: `search-${cardData.id}`,
          },
        });

        console.log('✅ Search card shape created with asset:', assetId);
      } catch (error) {
        console.error('❌ Failed to create search card shape:', error);
      }
    } else {
      console.error('❌ No image URL found for card data:', cardData);
    }
  };



  const centerView = () => {
    editor.zoomToFit();
  };

  const buttonStyles = {
    base: {
      padding: '8px 12px',
      border: 'none',
      borderRadius: '6px',
      cursor: 'pointer',
      fontSize: '11px',
      fontWeight: '500',
    },
    primary: { backgroundColor: '#3b82f6', color: 'white' },
    danger: { backgroundColor: '#dc2626', color: 'white' },
    secondary: { backgroundColor: '#6b7280', color: 'white' },
    success: { backgroundColor: '#059669', color: 'white' },
    warning: { backgroundColor: '#f59e0b', color: 'white' },
    purple: { backgroundColor: '#8b5cf6', color: 'white' },
  };

  return (
    <>
      {/* Main Game Panel */}
      <div style={{
        position: 'absolute',
        top: '20px',
        right: '20px',
        width: '280px',
        background: 'rgba(255, 255, 255, 0.98)',
        backdropFilter: 'blur(12px)',
        border: '1px solid rgba(0, 0, 0, 0.08)',
        borderRadius: '16px',
        padding: '16px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.08), 0 4px 16px rgba(0,0,0,0.04)',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        maxHeight: '90vh',
        overflowY: 'auto',
        zIndex: 1000,
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}>

        {/* Multiplayer Section */}
        <div style={{
          padding: '12px',
          background: 'rgba(248, 250, 252, 0.6)',
          border: '1px solid rgba(0, 0, 0, 0.04)',
          borderRadius: '10px',
        }}>
          <h3 style={{
            fontSize: '12px',
            fontWeight: '600',
            margin: '0 0 8px 0',
            color: '#374151',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
          }}>Multiplayer</h3>

          <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
            <input
              type="text"
              onChange={(e) => setPeerId(e.target.value)}
              value={peerId}
              placeholder="Enter peer ID"
              style={{
                flex: 1,
                padding: '8px 10px',
                borderRadius: '6px',
                border: '1px solid rgba(0, 0, 0, 0.08)',
                background: 'white',
                fontSize: '12px',
              }}
            />
            <button
              onClick={() => connectToPeer(peerId)}
              style={{ ...buttonStyles.base, ...buttonStyles.primary }}
            >
              Connect
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
            <span style={{ fontSize: '12px', fontWeight: '500', color: '#6b7280' }}>Your ID:</span>
            <input
              type="text"
              defaultValue={peer?.id}
              readOnly
              style={{
                flex: 1,
                padding: '4px 8px',
                borderRadius: '4px',
                border: '1px solid rgba(0, 0, 0, 0.06)',
                backgroundColor: '#f8fafc',
                fontSize: '11px',
                fontFamily: 'Monaco, Menlo, monospace',
                color: '#6b7280',
              }}
            />
          </div>

          {connections.size > 0 && (
            <div style={{
              padding: '6px 8px',
              background: 'rgba(34, 197, 94, 0.1)',
              border: '1px solid rgba(34, 197, 94, 0.2)',
              borderRadius: '4px',
              fontSize: '11px',
              color: '#166534',
              fontWeight: '500',
            }}>
              ✓ Connected to {connections.size} peer{connections.size !== 1 ? 's' : ''}
            </div>
          )}

          <button
            disabled={!canCallProuton}
            onClick={() => rateLimitedProuton()}
            style={{
              ...buttonStyles.base,
              ...(canCallProuton ? buttonStyles.warning : { backgroundColor: '#9ca3af', color: 'white' }),
              marginTop: '8px',
              cursor: canCallProuton ? 'pointer' : 'not-allowed',
            }}
          >
            Prouton!
          </button>
        </div>

        {/* Room Sharing Section */}
        <div style={{
          padding: '12px',
          background: 'rgba(248, 250, 252, 0.6)',
          border: '1px solid rgba(0, 0, 0, 0.04)',
          borderRadius: '10px',
        }}>
          <h3 style={{
            fontSize: '12px',
            fontWeight: '600',
            margin: '0 0 8px 0',
            color: '#374151',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
          }}>Room Sharing</h3>

          <div style={{ marginBottom: '8px' }}>
            <label style={{ 
              fontSize: '11px', 
              fontWeight: '500', 
              color: '#6b7280',
              display: 'block',
              marginBottom: '4px'
            }}>
              Share this room ID for multiplayer:
            </label>
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
              <input
                type="text"
                value={roomId}
                readOnly
                style={{
                  flex: 1,
                  padding: '6px 8px',
                  borderRadius: '4px',
                  border: '1px solid rgba(0, 0, 0, 0.06)',
                  backgroundColor: '#f8fafc',
                  fontSize: '10px',
                  fontFamily: 'Monaco, Menlo, monospace',
                  color: '#6b7280',
                }}
              />
              <button
                onClick={() => {
                  navigator.clipboard.writeText(roomId);
                  toast.success("Room ID copied to clipboard!");
                }}
                style={{
                  ...buttonStyles.base,
                  ...buttonStyles.primary,
                  padding: '6px 8px',
                  fontSize: '10px',
                }}
              >
                Copy
              </button>
            </div>
          </div>

          <div style={{ marginBottom: '8px' }}>
            <label style={{ 
              fontSize: '11px', 
              fontWeight: '500', 
              color: '#6b7280',
              display: 'block',
              marginBottom: '4px'
            }}>
              Join a different room:
            </label>
            <div style={{ display: 'flex', gap: '6px' }}>
              <input
                type="text"
                value={customRoomId}
                onChange={(e) => setCustomRoomId(e.target.value)}
                placeholder="Enter room ID..."
                style={{
                  flex: 1,
                  padding: '6px 8px',
                  borderRadius: '4px',
                  border: '1px solid rgba(0, 0, 0, 0.08)',
                  background: 'white',
                  fontSize: '10px',
                  fontFamily: 'Monaco, Menlo, monospace',
                }}
              />
              <button
                onClick={() => {
                  if (customRoomId.trim()) {
                    onRoomIdChange(customRoomId.trim());
                    toast.success(`Joined room: ${customRoomId.trim()}`);
                    setCustomRoomId("");
                  }
                }}
                disabled={!customRoomId.trim()}
                style={{
                  ...buttonStyles.base,
                  ...buttonStyles.success,
                  padding: '6px 8px',
                  fontSize: '10px',
                  opacity: customRoomId.trim() ? 1 : 0.5,
                  cursor: customRoomId.trim() ? 'pointer' : 'not-allowed',
                }}
              >
                Join
              </button>
            </div>
          </div>

          <div style={{
            padding: '6px 8px',
            background: 'rgba(59, 130, 246, 0.1)',
            border: '1px solid rgba(59, 130, 246, 0.2)',
            borderRadius: '4px',
            fontSize: '10px',
            color: '#1e40af',
            fontWeight: '400',
            lineHeight: '1.4',
          }}>
            💡 Share your room ID or join someone else's room for real-time collaboration!
          </div>
        </div>

        {/* Canvas Tools Section */}
        <div style={{
          padding: '12px',
          background: 'rgba(248, 250, 252, 0.6)',
          border: '1px solid rgba(0, 0, 0, 0.04)',
          borderRadius: '10px',
        }}>
          <h3 style={{
            fontSize: '12px',
            fontWeight: '600',
            margin: '0 0 8px 0',
            color: '#374151',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
          }}>Canvas Tools</h3>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            <button
              onClick={centerView}
              style={{ ...buttonStyles.base, ...buttonStyles.secondary }}
            >
              Center View
            </button>
          </div>
        </div>


        {/* Deck Management Section */}
        <div style={{
          padding: '12px',
          background: 'rgba(248, 250, 252, 0.6)',
          border: '1px solid rgba(0, 0, 0, 0.04)',
          borderRadius: '10px',
        }}>
          <h3 style={{
            fontSize: '12px',
            fontWeight: '600',
            margin: '0 0 8px 0',
            color: '#374151',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
          }}>Deck Management</h3>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(80px, 1fr))', gap: '8px' }}>
            <button
              onClick={drawCard}
              style={{ ...buttonStyles.base, ...buttonStyles.primary }}
            >
              Draw ({deck?.length})
            </button>
            <button
              onClick={mulligan}
              style={{ ...buttonStyles.base, ...buttonStyles.danger }}
            >
              Mulligan
            </button>
            <button
              onClick={onShuffleDeck}
              style={{ ...buttonStyles.base, ...buttonStyles.secondary }}
            >
              Shuffle
            </button>
            <button
              onClick={() =>
                showModal("Select deck", (closeModal) => (
                  <Form
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '12px',
                      padding: '20px',
                    }}
                    onSubmit={() => {
                      closeModal();
                    }}
                  >
                    <textarea
                      id="deck"
                      name="deck"
                      defaultValue={d ?? ""}
                      placeholder="1 Lightning Bolt&#10;4 Counterspell&#10;..."
                      style={{
                        minHeight: '200px',
                        padding: '12px',
                        borderRadius: '8px',
                        border: '1px solid #ccc',
                        fontFamily: 'monospace',
                        fontSize: '12px',
                      }}
                    />
                    <button
                      type="submit"
                      style={{
                        ...buttonStyles.base,
                        ...buttonStyles.primary,
                        padding: '12px',
                        borderRadius: '8px',
                      }}
                    >
                      Submit
                    </button>
                  </Form>
                ))
              }
              style={{ ...buttonStyles.base, ...buttonStyles.purple }}
            >
              Select Deck
            </button>
          </div>
        </div>

        {/* Card Search */}
        {allCards && allCards.length > 0 && (
          <div style={{
            padding: '12px',
            background: 'rgba(248, 250, 252, 0.6)',
            border: '1px solid rgba(0, 0, 0, 0.04)',
            borderRadius: '10px',
          }}>
            <h3 style={{
              fontSize: '12px',
              fontWeight: '600',
              margin: '0 0 8px 0',
              color: '#374151',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
            }}>Card Search</h3>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                const target = e.target as typeof e.target & {
                  card_name: { value: string };
                };
                const card = allCards.find(
                  (c) => c.name.toLowerCase() === target.card_name.value.toLowerCase()
                );
                if (card) {
                  createCardOnCanvas(card);
                } else {
                  console.error("Card not found");
                }
                target.card_name.value = "";
              }}
              style={{ display: 'flex', gap: '8px' }}
            >
              <datalist id="cards">
                {Array.from(new Set([...allCards.map((c) => c.name).sort()])).map(
                  (card) => (
                    <option key={card} value={card} />
                  )
                )}
              </datalist>
              <input
                type="search"
                id="cards"
                name="card_name"
                list="cards"
                required
                placeholder="Search card name..."
                style={{
                  flex: 1,
                  padding: '8px 10px',
                  borderRadius: '6px',
                  border: '1px solid rgba(0, 0, 0, 0.08)',
                  background: 'white',
                  fontSize: '12px',
                }}
              />
              <button
                type="submit"
                style={{ ...buttonStyles.base, ...buttonStyles.success }}
              >
                Add
              </button>
            </form>
          </div>
        )}

      </div>

      {/* Modal Display */}
      {modal}
    </>
  );
}
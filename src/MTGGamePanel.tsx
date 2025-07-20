import { useState } from 'react';
import { useEditor, AssetRecordType } from 'tldraw';
import { useLocation, Form } from "react-router-dom";
import toast from "react-hot-toast";
import useModal from "./hooks/useModal";
import { Card } from './types/canvas';

interface MTGGamePanelProps {
  deck: Card[];
  relatedCards: Card[];
  isLoading: boolean;
  drawCard: () => void;
  mulligan: () => void;
  onShuffleDeck: () => void;
  roomId: string;
  onRoomIdChange: (newRoomId: string) => void;
}

export function MTGGamePanel({ deck, relatedCards, isLoading, drawCard, mulligan, onShuffleDeck, roomId, onRoomIdChange }: MTGGamePanelProps) {
  const editor = useEditor();


  // Room state
  const [customRoomId, setCustomRoomId] = useState("");

  // Deck browser state
  const [isDeckBrowserOpen, setIsDeckBrowserOpen] = useState(true);
  const [deckSearchTerm, setDeckSearchTerm] = useState("");

  // Modal state
  const [modal, showModal] = useModal();

  // Deck and cards state
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const d = params.get("deck");


  // Play card from deck directly to canvas
  const playCardFromDeck = (card: Card) => {
    const viewportCenter = editor.getViewportScreenCenter();
    const cardImageUrl = card.src?.[card.srcIndex || 0];

    console.log('🎯 Playing card from deck:', { card, cardImageUrl });

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
          x: viewportCenter.x - 90,
          y: viewportCenter.y - 125,
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

        console.log('✅ Deck card shape created with asset:', assetId);
      } catch (error) {
        console.error('❌ Failed to create deck card shape:', error);
      }
    } else {
      console.error('❌ No card image URL found for deck card:', card);
    }
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
      {/* CSS for spinner animation */}
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>

      {/* Main Game Panel */}
      <div
        style={{
          position: 'absolute',
          top: `42px`,
          left: `0px`,
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
          }}>Multiplayer Room</h3>

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

        {/* Deck Browser Section */}
        <div style={{
          padding: '12px',
          background: 'rgba(248, 250, 252, 0.6)',
          border: '1px solid rgba(0, 0, 0, 0.04)',
          borderRadius: '10px',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <h3 style={{
              fontSize: '12px',
              fontWeight: '600',
              margin: '0',
              color: '#374151',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
            }}>Deck Browser ({(deck?.length || 0) + (relatedCards?.length || 0)})</h3>
            <button
              onClick={() => setIsDeckBrowserOpen(!isDeckBrowserOpen)}
              style={{
                ...buttonStyles.base,
                ...buttonStyles.secondary,
                padding: '4px 8px',
                fontSize: '10px',
              }}
            >
              {isDeckBrowserOpen ? '▼ Hide' : '▶ Show'}
            </button>
          </div>

          {isDeckBrowserOpen && (
            <>
              {/* Deck Search */}
              <div style={{ marginBottom: '8px' }}>
                <input
                  type="text"
                  placeholder="Search deck..."
                  value={deckSearchTerm}
                  onChange={(e) => setDeckSearchTerm(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '6px 8px',
                    borderRadius: '4px',
                    border: '1px solid rgba(0, 0, 0, 0.08)',
                    background: 'white',
                    fontSize: '11px',
                    marginBottom: '8px',
                  }}
                />
              </div>

              {/* Deck Cards List */}
              <div style={{
                maxHeight: '200px',
                overflowY: 'auto',
                border: '1px solid rgba(0, 0, 0, 0.08)',
                borderRadius: '6px',
                background: 'white',
              }}>
                {isLoading ? (
                  <div style={{
                    padding: '20px',
                    textAlign: 'center',
                    fontSize: '11px',
                    color: '#6b7280',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                  }}>
                    <div style={{
                      width: '16px',
                      height: '16px',
                      border: '2px solid #e5e7eb',
                      borderTop: '2px solid #3b82f6',
                      borderRadius: '50%',
                      animation: 'spin 1s linear infinite',
                    }}></div>
                    Loading deck...
                  </div>
                ) : (deck && deck.length > 0) || (relatedCards && relatedCards.length > 0) ? (
                  [...(deck || []), ...(relatedCards || [])]
                    .filter(card =>
                      !deckSearchTerm ||
                      (card.name && card.name.toLowerCase().includes(deckSearchTerm.toLowerCase()))
                    )
                    .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
                    .map((card, index) => (
                      <div
                        key={`${card.id}-${index}`}
                        onClick={() => playCardFromDeck(card)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          padding: '6px 8px',
                          cursor: 'pointer',
                          borderBottom: index < (deck?.length || 0) + (relatedCards?.length || 0) - 1 ? '1px solid rgba(0, 0, 0, 0.05)' : 'none',
                          transition: 'background-color 0.2s',
                          opacity: card.isRelatedCard ? 0.8 : 1,
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = card.isRelatedCard ? 'rgba(139, 92, 246, 0.1)' : 'rgba(59, 130, 246, 0.1)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = 'transparent';
                        }}
                      >
                        <img
                          src={card.src?.[card.srcIndex || 0]}
                          alt={card.name || 'Magic Card'}
                          style={{
                            width: '30px',
                            height: '42px',
                            objectFit: 'cover',
                            borderRadius: '3px',
                            marginRight: '8px',
                            border: card.isRelatedCard ? '2px solid #8b5cf6' : '1px solid rgba(0, 0, 0, 0.1)',
                          }}
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                          }}
                        />
                        <div style={{
                          flex: 1,
                          fontSize: '11px',
                          fontWeight: '500',
                          color: '#374151',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}>
                          {card.name || 'Unknown Card'}
                          {card.isRelatedCard && card.relatedTo && (
                            <div style={{
                              fontSize: '9px',
                              color: '#8b5cf6',
                              fontStyle: 'italic',
                            }}>
                              → {card.relatedTo}
                            </div>
                          )}
                        </div>
                        <div style={{
                          fontSize: '9px',
                          color: card.isRelatedCard ? '#8b5cf6' : '#6b7280',
                          backgroundColor: card.isRelatedCard ? 'rgba(139, 92, 246, 0.1)' : 'rgba(0, 0, 0, 0.05)',
                          padding: '2px 4px',
                          borderRadius: '3px',
                          marginLeft: '6px',
                        }}>
                          Play
                        </div>
                      </div>
                    ))
                ) : (
                  <div style={{
                    padding: '20px',
                    textAlign: 'center',
                    fontSize: '11px',
                    color: '#6b7280',
                  }}>
                    No cards in deck
                  </div>
                )}
              </div>

              {deckSearchTerm && (
                <div style={{
                  fontSize: '10px',
                  color: '#6b7280',
                  marginTop: '4px',
                  textAlign: 'center',
                }}>
                  {[...(deck || []), ...(relatedCards || [])]?.filter(card =>
                    card.name && card.name.toLowerCase().includes(deckSearchTerm.toLowerCase())
                  ).length || 0} cards found
                </div>
              )}
            </>
          )}
        </div>


      </div>

      {/* Modal Display */}
      {modal}
    </>
  );
}
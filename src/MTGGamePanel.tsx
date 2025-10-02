import { useState } from 'react';
import { useEditor, AssetRecordType } from 'tldraw';
import { useLocation, Form } from "react-router-dom";
import toast from "react-hot-toast";
import useModal from "./hooks/useModal";
import { Card } from './types/canvas';
import type { RoomSyncState } from './sync/useRoomSync';

interface MTGGamePanelProps {
  deck: Card[];
  relatedCards: Card[];
  isLoading: boolean;
  drawCard: () => void;
  mulligan: () => void;
  onShuffleDeck: () => void;
  roomId: string;
  onRoomIdChange: (newRoomId: string) => void;
  sync: RoomSyncState;
}

export function MTGGamePanel({ deck, relatedCards, isLoading, drawCard, mulligan, onShuffleDeck, roomId, onRoomIdChange, sync }: MTGGamePanelProps) {
  const editor = useEditor();


  // Room state
  const [customRoomId, setCustomRoomId] = useState("");
  const [incomingOffer, setIncomingOffer] = useState("");
  const [incomingAnswer, setIncomingAnswer] = useState("");

  // Deck browser state
  const [isDeckBrowserOpen, setIsDeckBrowserOpen] = useState(true);
  const [deckSearchTerm, setDeckSearchTerm] = useState("");

  // Modal state
  const [modal, showModal] = useModal();

  // Deck and cards state
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const d = params.get("deck");

  const statusColor = sync.status === 'online' ? '#059669' : sync.status === 'error' ? '#dc2626' : '#6b7280';

  const copyToken = async (token: string, successMessage: string) => {
    if (!token) return;
    try {
      await navigator.clipboard.writeText(token);
      toast.success(successMessage);
    } catch (copyError) {
      console.warn('[sync] Clipboard write failed', copyError);
      toast.success(`${successMessage} (copy manually)`);
    }
  };

  const handleCreateOffer = async () => {
    try {
      const token = await sync.createOffer();
      void copyToken(token, 'Offer copied to clipboard. Share it with your peer.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create offer');
    }
  };

  const handleAcceptOffer = async () => {
    const token = incomingOffer.trim();
    if (!token) return;
    try {
      const answer = await sync.acceptOffer(token);
      setIncomingOffer('');
      void copyToken(answer, 'Answer copied to clipboard. Send it to the host.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to accept offer');
    }
  };

  const handleSubmitAnswer = async () => {
    const token = incomingAnswer.trim();
    if (!token) return;
    try {
      await sync.submitAnswer(token);
      toast.success('Answer applied. Waiting for peer...');
      setIncomingAnswer('');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to apply answer');
    }
  };

  const handleResetSync = () => {
    sync.reset();
    setIncomingOffer('');
    setIncomingAnswer('');
  };

  const trimmedOffer = incomingOffer.trim();
  const trimmedAnswer = incomingAnswer.trim();
  const canCreateOffer = !['creating-offer', 'awaiting-answer', 'waiting-peer', 'connecting', 'online'].includes(sync.status);
  const canAcceptOffer = trimmedOffer.length > 0 && !['creating-offer', 'awaiting-answer', 'waiting-peer', 'connecting', 'online'].includes(sync.status);
  const canSubmitAnswer = trimmedAnswer.length > 0 && sync.status === 'awaiting-answer';

  
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
              <span
                style={{
                  fontSize: '10px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.6px',
                  color: statusColor,
                  fontWeight: 600,
                }}
              >
                {sync.status}
              </span>
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

        <div
          style={{
            marginTop: '12px',
            padding: '10px',
            background: 'rgba(255, 255, 255, 0.7)',
            borderRadius: '8px',
            border: '1px solid rgba(0, 0, 0, 0.05)',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{
              fontSize: '11px',
              fontWeight: 600,
              color: '#374151',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
            }}>
              Peer-to-Peer Sync
            </span>
            {sync.role && (
              <span style={{ fontSize: '10px', color: '#6b7280', fontWeight: 500 }}>
                role: {sync.role}
              </span>
            )}
          </div>

          {sync.error && (
            <div
              style={{
                fontSize: '10px',
                color: '#dc2626',
                background: 'rgba(220,38,38,0.08)',
                borderRadius: '6px',
                padding: '6px 8px',
                lineHeight: 1.3,
              }}
            >
              {sync.error}
            </div>
          )}

          <button
            onClick={handleCreateOffer}
            disabled={!canCreateOffer}
            style={{
              ...buttonStyles.base,
              ...buttonStyles.primary,
              opacity: canCreateOffer ? 1 : 0.5,
              cursor: canCreateOffer ? 'pointer' : 'not-allowed',
            }}
          >
            Create Offer (Host)
          </button>

          {sync.offerToken && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '10px', fontWeight: 600, color: '#374151' }}>Share this offer code:</label>
              <textarea
                readOnly
                value={sync.offerToken}
                style={{
                  width: '100%',
                  minHeight: '70px',
                  padding: '8px',
                  borderRadius: '6px',
                  border: '1px solid rgba(0, 0, 0, 0.08)',
                  fontFamily: 'Monaco, Menlo, monospace',
                  fontSize: '10px',
                  background: '#f8fafc',
                }}
              />
              <button
                onClick={() => void copyToken(sync.offerToken ?? '', 'Offer copied to clipboard.')}
                style={{
                  ...buttonStyles.base,
                  ...buttonStyles.secondary,
                  alignSelf: 'flex-start',
                  fontSize: '10px',
                }}
              >
                Copy offer
              </button>
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: '10px', fontWeight: 600, color: '#374151' }}>Paste offer from host:</label>
            <textarea
              value={incomingOffer}
              onChange={(e) => setIncomingOffer(e.target.value)}
              placeholder="Paste offer token here"
              style={{
                width: '100%',
                minHeight: '70px',
                padding: '8px',
                borderRadius: '6px',
                border: '1px solid rgba(0, 0, 0, 0.08)',
                fontFamily: 'Monaco, Menlo, monospace',
                fontSize: '10px',
                background: 'white',
              }}
            />
            <button
              onClick={handleAcceptOffer}
              disabled={!canAcceptOffer}
              style={{
                ...buttonStyles.base,
                ...buttonStyles.success,
                opacity: canAcceptOffer ? 1 : 0.5,
                cursor: canAcceptOffer ? 'pointer' : 'not-allowed',
                fontSize: '10px',
              }}
            >
              Accept offer & generate answer (Join)
            </button>
          </div>

          {sync.answerToken && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '10px', fontWeight: 600, color: '#374151' }}>Share this answer with the host:</label>
              <textarea
                readOnly
                value={sync.answerToken}
                style={{
                  width: '100%',
                  minHeight: '70px',
                  padding: '8px',
                  borderRadius: '6px',
                  border: '1px solid rgba(0, 0, 0, 0.08)',
                  fontFamily: 'Monaco, Menlo, monospace',
                  fontSize: '10px',
                  background: '#f8fafc',
                }}
              />
              <button
                onClick={() => void copyToken(sync.answerToken ?? '', 'Answer copied to clipboard.')}
                style={{
                  ...buttonStyles.base,
                  ...buttonStyles.secondary,
                  alignSelf: 'flex-start',
                  fontSize: '10px',
                }}
              >
                Copy answer
              </button>
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: '10px', fontWeight: 600, color: '#374151' }}>Paste answer from joiner:</label>
            <textarea
              value={incomingAnswer}
              onChange={(e) => setIncomingAnswer(e.target.value)}
              placeholder="Paste answer token here"
              style={{
                width: '100%',
                minHeight: '70px',
                padding: '8px',
                borderRadius: '6px',
                border: '1px solid rgba(0, 0, 0, 0.08)',
                fontFamily: 'Monaco, Menlo, monospace',
                fontSize: '10px',
                background: 'white',
              }}
            />
            <button
              onClick={handleSubmitAnswer}
              disabled={!canSubmitAnswer}
              style={{
                ...buttonStyles.base,
                ...buttonStyles.primary,
                opacity: canSubmitAnswer ? 1 : 0.5,
                cursor: canSubmitAnswer ? 'pointer' : 'not-allowed',
                fontSize: '10px',
              }}
            >
              Apply answer (Host)
            </button>
          </div>

          <button
            onClick={handleResetSync}
            style={{
              ...buttonStyles.base,
              ...buttonStyles.secondary,
              fontSize: '10px',
            }}
          >
            Reset sync
          </button>
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

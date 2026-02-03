import React from "react";
import { useLocation, Form } from "react-router-dom";
import useModal from "./hooks/useModal";
import { usePeerStore } from "./hooks/usePeerConnection";
import { useShapeStore } from "./hooks/useShapeStore";
import { Datum } from "./hooks/useCards";
import { Camera, Mode, Card, ShapeType } from "./types/canvas";
import "./SelectionPanel.css";

export function SelectionPanel({
  onDrawCard,
  setMode,
  mode,
  onMulligan,
  onShuffleDeck,
  cards,
  addCardToHand,
  relatedCards,
  deck,
  shapeType,
  setShapeType,
  peerPresence,
  heartbeatStaleMs,
  peerNames,
  rollCoin,
  rollD6,
  untapAll,
}: {
  onDrawCard: () => void;
  setCamera: React.Dispatch<React.SetStateAction<Camera>>;
  setMode: React.Dispatch<React.SetStateAction<Mode>>;
  mode: Mode;
  onMulligan: () => void;
  onShuffleDeck: () => void;
  addCardToHand: (card: Datum) => void;
  cards?: Datum[];
  relatedCards?: Datum[];
  addToken: () => void;
  changeColor: (color: string) => void;
  deck?: Card[];
  shapeType: ShapeType;
  setShapeType: React.Dispatch<React.SetStateAction<ShapeType>>;
  peerPresence: Record<string, number>;
  heartbeatStaleMs: number;
  peerNames: Record<string, string>;
  rollCoin: () => void;
  rollD6: () => void;
  rollD20: () => void;
  pickStarter: () => void;
  untapAll: () => void;
}) {
  // Peer connection state
  const connectToPeer = usePeerStore((state) => state.connectToPeer);
  const peer = usePeerStore((state) => state.peer);
  const connections = usePeerStore((state) => state.connections);
  const [peerId, setPeerId] = React.useState("");
  const [copied, setCopied] = React.useState(false);
  const [showPeerStatus, setShowPeerStatus] = React.useState(false);
  const [isMobile, setIsMobile] = React.useState(() =>
    typeof window === "undefined"
      ? false
      : window.matchMedia("(max-width: 720px)").matches
  );
  const [isCollapsed, setIsCollapsed] = React.useState(() =>
    typeof window === "undefined"
      ? false
      : window.matchMedia("(max-width: 720px)").matches
  );
  const [isCommandPressed, setIsCommandPressed] = React.useState(false);

  // Modal state
  const [modal, showModal] = useModal();

  // Shape state
  const setSelectedShapeIds = useShapeStore(
    (state) => state.setSelectedShapeIds
  );

  const [now, setNow] = React.useState(() => Date.now());
  const [cardQuery, setCardQuery] = React.useState("");
  const [previewCard, setPreviewCard] = React.useState<Datum | null>(null);

  // Deck state
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const d = params.get("deck");

  const allCards = cards ? [...cards, ...(relatedCards ?? [])] : [];
  const uniqueCards = (() => {
    const map = new Map<string, Datum>();
    allCards.forEach((card) => {
      if (!map.has(card.name)) {
        map.set(card.name, card);
      }
    });
    return Array.from(map.values());
  })();

  const filteredCards = (() => {
    const query = cardQuery.trim().toLowerCase();
    if (!query) {
      return uniqueCards;
    }
    return uniqueCards.filter((card) =>
      card.name.toLowerCase().includes(query)
    );
  })();

  const hasQuery = cardQuery.trim().length > 0;
  const visibleCards = filteredCards.slice(0, isMobile ? 30 : 72);
  const previewImage =
    previewCard?.image_uris?.normal ??
    previewCard?.card_faces?.[0]?.image_uris?.normal ??
    "";
  const peerStatusList = Array.from(connections.keys()).map((peerId) => {
    const lastSeen = peerPresence[peerId];
    const stale = !lastSeen || now - lastSeen > heartbeatStaleMs;
    const name = peerNames[peerId];
    return {
      peerId,
      stale,
      name,
      label: !lastSeen
        ? "Waiting..."
        : `${Math.max(0, Math.round((now - lastSeen) / 1000))}s ago`,
    };
  });

  React.useEffect(() => {
    const intervalId = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(intervalId);
  }, []);

  React.useEffect(() => {
    setPreviewCard(null);
  }, [cardQuery]);

  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Control") {
        setIsCommandPressed(true);
      }
    };
    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.key === "Control") {
        setIsCommandPressed(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, []);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia("(max-width: 720px)");
    const handleChange = (event: MediaQueryListEvent) => {
      setIsMobile(event.matches);
      setIsCollapsed(event.matches);
    };
    media.addEventListener("change", handleChange);
    return () => media.removeEventListener("change", handleChange);
  }, []);

  return (
    <div
      className={`selection-panel ${isMobile && isCollapsed ? "selection-panel--collapsed" : ""}`}
    >
      <div className="selection-panel-mobile-bar">
        <button className="primary" onClick={onDrawCard}>
          Draw ({deck?.length})
        </button>
        <button
          type="button"
          className="selection-panel-collapse-toggle"
          onClick={() => setIsCollapsed((prev) => !prev)}
          aria-expanded={!isCollapsed}
        >
          {isCollapsed ? "Expand" : "Collapse"}
        </button>
      </div>
      <div className="selection-panel-section selection-panel-section--primary">
        <h3>Quick Actions</h3>

        <div className="panel-block">
          <div className="panel-block-title">Multiplayer</div>
          <div className="peer-connection">
            <input
              type="text"
              onChange={(e) => setPeerId(e.target.value)}
              value={peerId}
              placeholder="Friend's peer ID"
            />
            <button className="primary" onClick={() => connectToPeer(peerId)}>
              Connect
            </button>
          </div>

          <div className="peer-id-display">
            <label>Your ID</label>
            <input type="text" defaultValue={peer?.id} readOnly />
            <button
              className="peer-id-copy-btn"
              onClick={() => {
                if (peer?.id) {
                  navigator.clipboard.writeText(peer.id);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }
              }}
            >
              {copied ? "✓" : "Copy"}
            </button>
          </div>

          {connections.size > 0 && (
            <div className={`peer-connection-status ${!showPeerStatus ? "collapsed" : ""}`}>
              <div className="peer-status-header">
                <span>
                  <span className="peer-status-indicator" aria-hidden="true" />
                  Connected to {connections.size} peer
                  {connections.size !== 1 ? "s" : ""}
                </span>
                <button
                  type="button"
                  className="peer-status-toggle"
                  onClick={() => setShowPeerStatus((prev) => !prev)}
                >
                  {showPeerStatus ? "Hide" : "Show"}
                </button>
              </div>
              {showPeerStatus && peerStatusList.length > 0 && (
                <div className="peer-status-grid">
                  {peerStatusList.map((status) => (
                    <div
                      key={status.peerId}
                      className={`peer-status ${status.stale ? "stale" : "active"}`}
                    >
                      <div className="peer-status-id">{status.name || status.peerId}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="panel-divider" />

        <div className="panel-block">
          <div className="panel-block-title">Deck</div>
          <div className="selection-panel-button-group deck-actions">
            <button
              className="primary"
              onClick={() =>
                showModal("Select deck", (closeModal) => (
                  <Form
                    className="modal-form"
                    onSubmit={() => {
                      closeModal();
                    }}
                  >
                    <textarea
                      id="deck"
                      name="deck"
                      defaultValue={d ?? ""}
                      placeholder={`1 Legion Angel
3 Wedding Announcement
...`}
                    />
                    <button className="modal-button" type="submit">
                      Submit
                    </button>
                  </Form>
                ))
              }
            >
              Select Deck
            </button>
            <button className="primary" onClick={onDrawCard}>
              Draw ({deck?.length})
            </button>
            <button onClick={onShuffleDeck}>Shuffle</button>
            <button className="danger" onClick={onMulligan}>
              Mulligan
            </button>
          </div>
        </div>

        {allCards && allCards.length > 0 && (
          <div className="panel-block">
            <div className="panel-block-title">Card Search</div>
            <button
              type="button"
              onClick={() =>
                showModal("Card Search", () => (
                  <div className="card-search-panel card-search-panel--modal">
                    <form
                      className="card-search-controls card-search-controls--modal"
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (!hasQuery || !filteredCards.length) {
                          return;
                        }
                        addCardToHand(filteredCards[0]);
                        setCardQuery("");
                      }}
                    >
                      <input
                        onFocus={() => {
                          setSelectedShapeIds([]);
                        }}
                        type="search"
                        value={cardQuery}
                        onChange={(event) => setCardQuery(event.target.value)}
                        placeholder="Search card name..."
                        aria-label="Search cards"
                      />
                      <button
                        className="success"
                        title="Add top match"
                        type="submit"
                        disabled={!hasQuery || !filteredCards.length}
                      >
                        Add
                      </button>
                    </form>
                    <div className="card-search-content card-search-content--modal">
                      <div
                        className="card-search-results card-search-results--modal"
                        onMouseLeave={() => setPreviewCard(null)}
                      >
                        {visibleCards.map((card) => {
                          const image =
                            card.image_uris?.small ??
                            card.card_faces?.[0]?.image_uris?.small ??
                            card.image_uris?.normal ??
                            card.card_faces?.[0]?.image_uris?.normal ??
                            "";
                          return (
                            <button
                              key={card.id}
                              type="button"
                              className="card-search-item"
                              onClick={() => addCardToHand(card)}
                              onMouseEnter={() => setPreviewCard(card)}
                              onFocus={() => setPreviewCard(card)}
                            >
                              <img src={image} alt={card.name} />
                              <span>{card.name}</span>
                            </button>
                          );
                        })}
                        {visibleCards.length === 0 && (
                          <div className="card-search-empty">No matches.</div>
                        )}
                      </div>
                    </div>
                    {isCommandPressed && previewImage && (
                      <div className="card-search-zoom">
                        <img
                          src={previewImage}
                          alt={previewCard?.name ?? "Card preview"}
                        />
                      </div>
                    )}
                  </div>
                ))
              }
            >
              Open Card Search
            </button>
          </div>
        )}
      </div>

      <details className="selection-panel-section panel-details panel-details--tools">
        <summary>Tools</summary>
        <div className="panel-block">
          <div className="panel-block-title">Drawing</div>
          <div className="shape-type-options">
            <div className="shape-type-option">
              <input
                type="radio"
                id="select"
                name="action"
                value="select"
                checked={mode === "select"}
                onChange={() => setMode("select")}
              />
              <label htmlFor="select">
                <span className="tool-icon">&gt;</span>
                <span className="tool-label">Select</span>
              </label>
            </div>
            <div className="shape-type-option">
              <input
                type="radio"
                id="create"
                name="action"
                value="create"
                checked={mode === "create" && shapeType === "text"}
                onChange={() => {
                  setMode("create");
                  setShapeType("text");
                }}
              />
              <label htmlFor="create">
                <span className="tool-icon">T</span>
                <span className="tool-label">Text</span>
              </label>
            </div>
            <div className="shape-type-option">
              <input
                type="radio"
                id="add"
                name="action"
                checked={mode === "create" && shapeType === "token"}
                onChange={() => {
                  setMode("create");
                  setShapeType("token");
                }}
              />
              <label htmlFor="add">
                <span className="tool-icon">O</span>
                <span className="tool-label">Token</span>
              </label>
            </div>
            <div className="shape-type-option">
              <input
                type="radio"
                id="rectangle"
                name="action"
                checked={mode === "create" && shapeType === "rectangle"}
                onChange={() => {
                  setMode("create");
                  setShapeType("rectangle");
                }}
              />
              <label htmlFor="rectangle">
                <span className="tool-icon">[]</span>
                <span className="tool-label">Rect</span>
              </label>
            </div>
          </div>
        </div>

        <div className="panel-block">
          <div className="panel-block-title">Random (open devtools)</div>
          <div className="selection-panel-button-group">
            <button onClick={rollCoin}>Flip Coin</button>
            <button onClick={rollD6}>Roll d6</button>
          </div>
        </div>

        <div className="panel-block">
          <div className="panel-block-title">Board</div>
          <div className="selection-panel-button-group">
            <button onClick={untapAll}>Untap all</button>
          </div>
        </div>
      </details>

      {/* Modal Display */}
      {modal}
    </div>
  );
}

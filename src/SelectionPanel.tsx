import React from "react";
import { useLocation, Form } from "react-router-dom";
import useModal from "./hooks/useModal";
import { usePeerStore } from "./hooks/usePeerConnection";
import { useRateLimit } from "./hooks/useRateLimit";
import { useShapeStore } from "./hooks/useShapeStore";
import { Datum } from "./hooks/useCards";
import { getBounds } from "./utils/canvas_utils";
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
  setCamera,
  deck,
  shapeType,
  setShapeType,
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
}) {
  // Peer connection state
  const connectToPeer = usePeerStore((state) => state.connectToPeer);
  const sendMessage = usePeerStore((state) => state.sendMessage);
  const peer = usePeerStore((state) => state.peer);
  const connections = usePeerStore((state) => state.connections);
  const [peerId, setPeerId] = React.useState("");
  const [copied, setCopied] = React.useState(false);

  // Modal state
  const [modal, showModal] = useModal();

  // Shape state
  const selectedShapeIds = useShapeStore((state) => state.selectedShapeIds);
  const setSelectedShapeIds = useShapeStore(
    (state) => state.setSelectedShapeIds
  );
  const shapes = useShapeStore((state) => state.shapes);
  const selectedShapes = shapes.filter((shape) =>
    selectedShapeIds.includes(shape.id)
  );
  const setShapes = useShapeStore((state) => state.setShapes);

  // Deck state
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const d = params.get("deck");

  // Prouton rate limiting
  function prouton() {
    sendMessage({ type: "prouton", payload: "Prouton!" });
  }
  const { rateLimitedFn: rateLimitedProuton, canCall: canCallProuton } =
    useRateLimit(prouton, {
      maxCalls: 30,
      timeWindow: 60000, // 30 calls per minute
    });

  // Derived state
  const canEditFontSize =
    selectedShapes.length === 1 && selectedShapes[0]?.type === "text";
  const allCards = cards ? [...cards, ...(relatedCards ?? [])] : [];

  return (
    <div className="selection-panel">
      {/* Peer Connection Section */}
      <div className="selection-panel-section">
        <h3>Multiplayer</h3>
        <div className="peer-connection">
          <input
            type="text"
            onChange={(e) => setPeerId(e.target.value)}
            value={peerId}
            placeholder="Enter peer ID"
          />
          <button className="primary" onClick={() => connectToPeer(peerId)}>Connect</button>
        </div>

        <div className="peer-id-display">
          <label>Your ID:</label>
          <input type="text" defaultValue={peer?.id} readOnly />
          <button
            style={{ fontSize: "12px", padding: "4px 8px" }}
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
          <div className="peer-connection-status">
            ✓ Connected to {connections.size} peer
            {connections.size !== 1 ? "s" : ""}
          </div>
        )}

        <button
          disabled={!canCallProuton}
          onClick={() => {
            rateLimitedProuton();
          }}
          style={{ marginTop: "8px" }}
        >
          Prouton!
        </button>
      </div>
      {/* Drawing Tools Section */}
      <div className="selection-panel-section">
        <h3>Drawing Tools</h3>
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
              <span className="tool-icon">↖</span>
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
              <span className="tool-icon">●</span>
              <span className="tool-label">Token</span>
            </label>
          </div>
          {/* <div className="shape-type-option">
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
              <span className="tool-icon">▢</span>
              <span className="tool-label">Rect</span>
            </label>
          </div> */}
        </div>
      </div>

      {/* Deck Management Section */}
      <div className="selection-panel-section">
        <h3>Deck Management</h3>
        <div className="selection-panel-button-group">
          <button className="primary" onClick={onDrawCard}>Draw ({deck?.length})</button>
          <button className="danger" onClick={onMulligan}>Mulligan</button>
          <button onClick={onShuffleDeck}>Shuffle</button>
          <button
            onClick={() =>
              showModal("Select deck", (closeModal) => (
                <Form
                  className="modal-form"
                  onSubmit={() => {
                    closeModal();
                  }}
                >
                  <textarea id="deck" name="deck" defaultValue={d ?? ""} placeholder={`1 Legion Angel
3 Wedding Announcement
...`} />
                  <button className="modal-button" type="submit">
                    Submit
                  </button>
                </Form>
              ))
            }
          >
            Select Deck
          </button>
        </div>
      </div>

      {/* Card Search */}
      {allCards && allCards.length > 0 && (
        <div className="selection-panel-section">
          <h3>Card Search</h3>
          <form
            className="card-search"
            onSubmit={(e) => {
              e.preventDefault();
              const target = e.target as typeof e.target & {
                card_name: {
                  value: string;
                };
              };
              const card = allCards.find(
                (c) =>
                  c.name.toLowerCase() === target.card_name.value.toLowerCase()
              );
              if (card) {
                addCardToHand(card);
              } else {
                console.error("Card not found");
              }
              target.card_name.value = "";
            }}
          >
            <datalist id="cards">
              {Array.from(new Set([...allCards.map((c) => c.name).sort()])).map(
                (card) => (
                  <option key={card} value={card} />
                )
              )}
            </datalist>
            <input
              onFocus={() => {
                setSelectedShapeIds([]);
              }}
              type="search"
              id="cards"
              name="card_name"
              list="cards"
              required
              placeholder="Search card name..."
            />
            <button className="success" title="find in deck" type="submit">
              Add
            </button>
          </form>
        </div>
      )}

      {/* Properties Section - only display when a shape is selected */}
      {selectedShapes.length > 0 && canEditFontSize && (
        <div className="selection-panel-section">
          <h3>Text Properties</h3>
          <div className="font-size-selector">
            <label>Font Size:</label>
            <select
              value={selectedShapes[0]?.fontSize}
              onChange={(e) => {
                setShapes((prevShapes) =>
                  prevShapes.map((shape) => {
                    const bounds = getBounds(
                      shape.text ?? "",
                      shape.point[0],
                      shape.point[1],
                      parseInt(e.target.value)
                    );

                    return selectedShapeIds.includes(shape.id)
                      ? {
                        ...shape,
                        fontSize: parseInt(e.target.value),
                        size: [bounds.width, bounds.height],
                      }
                      : shape;
                  })
                );
              }}
            >
              <option value={12}>12</option>
              <option value={16}>16</option>
              <option value={24}>24</option>
              <option value={32}>32</option>
              <option value={48}>48</option>
              <option value={64}>64</option>
            </select>
          </div>
        </div>
      )}
      {/* Canvas Controls */}
      <div className="selection-panel-section">
        <h3>Canvas Controls</h3>
        <div className="selection-panel-button-group">
          <button
            onClick={() => {
              setCamera((prev) => ({ ...prev, x: 0, y: 0 }));
            }}
          >
            Center View
          </button>
        </div>
      </div>

      {/* Modal Display */}
      {modal}
    </div>
  );
}

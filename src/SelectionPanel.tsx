import React from "react";
import { useLocation, Form } from "react-router-dom";
import { Camera, Card, Mode, ShapeType } from "./Canvas";
import useModal from "./hooks/useModal";
import { usePeerStore } from "./hooks/usePeerConnection";
import { useRateLimit } from "./hooks/useRateLimit";
import { useShapeStore } from "./hooks/useShapeStore";
import { Datum } from "./hooks/useCards";
import { colors } from "./utils/colors";

export function SelectionPanel({
  onDrawCard,
  setMode,
  mode,
  onMulligan,
  onShuffleDeck,
  cards,
  addCardToHand,
  relatedCards,
  addToken,
  setCamera,
  changeColor,
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
  const connectToPeer = usePeerStore((state) => state.connectToPeer);
  const sendMessage = usePeerStore((state) => state.sendMessage);
  const peer = usePeerStore((state) => state.peer);
  const [peerId, setPeerId] = React.useState("");
  const [modal, showModal] = useModal();
  const selectedShapeIds = useShapeStore((state) => state.selectedShapeIds);
  const shapes = useShapeStore((state) => state.shapes);
  const selectedShapes = shapes.filter((shape) =>
    selectedShapeIds.includes(shape.id)
  );
  const setShapes = useShapeStore((state) => state.setShapes);
  function prouton() {
    sendMessage({ type: "prouton", payload: "Prouton!" });
  }
  const { rateLimitedFn: rateLimitedProuton, canCall: canCallProuton } =
    useRateLimit(prouton, {
      maxCalls: 30,
      timeWindow: 60000,
    }); // 3 calls per minute
  const connections = usePeerStore((state) => state.connections);
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const d = params.get("deck");
  const canEditFontSize =
    selectedShapes.length === 1 && selectedShapes[0]?.type === "text";

  const allCards = cards ? [...cards, ...(relatedCards ?? [])] : [];
  return (
    <div className="selection-panel">
      <div>
        <div>
          <button onClick={onDrawCard}>Draw ({deck?.length})</button>
        </div>
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
        <label htmlFor="create">Text</label>
        <div>
          <input
            type="radio"
            id="add"
            name="action"
            value="add"
            checked={mode === "create" && shapeType === "token"}
            onChange={() => {
              setMode("create");
              setShapeType("token");
            }}
          />
          <label htmlFor="add">Token</label>
        </div>
        <div>
          <input
            type="radio"
            id="select"
            name="action"
            value="select"
            checked={mode === "select"}
            onChange={() => setMode("select")}
          />
          <label htmlFor="select">Select</label>
        </div>
      </div>
      <div>
        <button onClick={onMulligan}>Mulligan</button>
        <button onClick={onShuffleDeck}>Shuffle Deck</button>
        <button
          onClick={() =>
            showModal("Select deck", (closeModal) => (
              <Form
                className="modal-form"
                onSubmit={() => {
                  closeModal();
                }}
              >
                <textarea id="deck" name="deck" defaultValue={d ?? ""} />
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
      <label>
        your id: <input type="text" defaultValue={peer?.id} readOnly />
      </label>
      <div style={{ display: "flex", gap: "1rem" }}>
        <input
          type="text"
          onChange={(e) => setPeerId(e.target.value)}
          value={peerId}
        />
        <button onClick={() => connectToPeer(peerId)}>Connect</button>
      </div>

      {connections.size > 0 && <div>connected ({connections.size})</div>}
      {modal}
      {canEditFontSize && (
        <select
          value={selectedShapes[0]?.fontSize}
          onChange={(e) => {
            setShapes((prevShapes) =>
              prevShapes.map((shape) =>
                selectedShapeIds.includes(shape.id)
                  ? { ...shape, fontSize: parseInt(e.target.value) }
                  : shape
              )
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
      )}
      {allCards && (
        <form
          style={{ display: "flex", gap: "1rem" }}
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
          {" "}
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
            className="px-3"
            required
            placeholder="card name"
          ></input>
          <button title="find in deck" type="submit">
            Search
          </button>
        </form>
      )}
      <div>
        <button
          disabled={!canCallProuton}
          onClick={() => {
            rateLimitedProuton();
          }}
        >
          Prouton!
        </button>
        <button
          onClick={() => {
            setShapes((prevShapes) =>
              prevShapes.map((shape) => ({ ...shape, rotation: 0 }))
            );
          }}
        >
          Disengage all
        </button>
        <button onClick={addToken}>Add token</button>
        <button
          onClick={() => {
            setCamera((prev) => ({ ...prev, x: 0, y: 0 }));
          }}
        >
          Return to center
        </button>
      </div>
      {selectedShapes.length === 1 && (
        <select
          onChange={(e) => changeColor(e.target.value)}
          value={selectedShapes[0]?.color ?? "#000000"}
        >
          {Object.entries(colors).map(([value]) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

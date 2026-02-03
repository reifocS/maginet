import React from "react";
import { useLocation, Form } from "react-router-dom";
import useModal from "./hooks/useModal";
import { usePeerStore } from "./hooks/usePeerConnection";
import { useShapeStore } from "./hooks/useShapeStore";
import { Datum } from "./hooks/useCards";
import { Camera, Mode, Card, ShapeType } from "./types/canvas";
import "./SelectionPanel.css";

type TooltipFace = {
  name?: string;
  manaCost?: string;
  typeLine?: string;
  oracleText?: string;
  power?: string;
  toughness?: string;
};

const getCardTooltipFaces = (card: Datum): TooltipFace[] => {
  const faces = card.card_faces && card.card_faces.length > 0 ? card.card_faces : [card];
  return faces.map((face) => ({
    name: face.name ?? card.name,
    manaCost: face.mana_cost ?? card.mana_cost,
    typeLine: face.type_line ?? card.type_line,
    oracleText: face.oracle_text ?? card.oracle_text,
    power: face.power ?? card.power,
    toughness: face.toughness ?? card.toughness,
  }));
};

const positionCardTooltip = (
  event: React.MouseEvent<HTMLButtonElement> | React.FocusEvent<HTMLButtonElement>
) => {
  const button = event.currentTarget;
  const tooltip = button.querySelector(
    ".card-search-tooltip"
  ) as HTMLDivElement | null;
  if (!tooltip) return;

  const modal = button.closest(".Modal__modal") as HTMLElement | null;
  const modalRect = modal?.getBoundingClientRect() ?? {
    left: 0,
    top: 0,
    right: window.innerWidth,
    bottom: window.innerHeight,
    width: window.innerWidth,
    height: window.innerHeight,
  };
  const buttonRect = button.getBoundingClientRect();
  const tooltipRect = tooltip.getBoundingClientRect();

  const padding = 8;
  const gap = 8;

  const spaceRight = modalRect.right - buttonRect.right;
  const spaceLeft = buttonRect.left - modalRect.left;
  const placeRight = spaceRight >= tooltipRect.width + gap || spaceRight >= spaceLeft;

  let left = placeRight
    ? buttonRect.right + gap
    : buttonRect.left - gap - tooltipRect.width;

  if (left + tooltipRect.width > modalRect.right - padding) {
    left = modalRect.right - padding - tooltipRect.width;
  }
  if (left < modalRect.left + padding) {
    left = modalRect.left + padding;
  }

  let top = buttonRect.top;
  if (top + tooltipRect.height > modalRect.bottom - padding) {
    top = modalRect.bottom - padding - tooltipRect.height;
  }
  if (top < modalRect.top + padding) {
    top = modalRect.top + padding;
  }

  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
};

type ConnectModalProps = {
  onConnect: (peerId: string) => void;
};

const ConnectModal = ({ onConnect }: ConnectModalProps) => {
  const [value, setValue] = React.useState("");
  const trimmedValue = value.trim();

  return (
    <div className="peer-connect-modal">
      <form
        className="peer-connection peer-connection--modal"
        onSubmit={(event) => {
          event.preventDefault();
          if (!trimmedValue) return;
          onConnect(trimmedValue);
        }}
      >
        <input
          type="text"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="Friend's peer ID"
        />
        <button className="success" type="submit" disabled={!trimmedValue}>
          Connect
        </button>
      </form>
      <div className="peer-connect-hint">
        Share your ID and click connect to join a table.
      </div>
    </div>
  );
};

type CardSearchModalProps = {
  cards: Datum[];
  addCardToHand: (card: Datum) => void;
  setSelectedShapeIds: (ids: string[]) => void;
  isMobile: boolean;
};

const CardSearchModal = ({
  cards,
  addCardToHand,
  setSelectedShapeIds,
  isMobile,
}: CardSearchModalProps) => {
  const [query, setQuery] = React.useState("");
  const [previewCard, setPreviewCard] = React.useState<Datum | null>(null);
  const [isCommandPressed, setIsCommandPressed] = React.useState(false);

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
    setPreviewCard(null);
  }, [query]);

  const filteredCards = React.useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) {
      return cards;
    }
    return cards.filter((card) => card.name.toLowerCase().includes(trimmed));
  }, [cards, query]);

  const hasQuery = query.trim().length > 0;
  const visibleCards = filteredCards.slice(0, isMobile ? 30 : 72);
  const previewImage =
    previewCard?.image_uris?.normal ??
    previewCard?.card_faces?.[0]?.image_uris?.normal ??
    "";

  return (
    <div className="card-search-panel card-search-panel--modal">
      <form
        className="card-search-controls card-search-controls--modal"
        onSubmit={(event) => {
          event.preventDefault();
          if (!hasQuery || !filteredCards.length) {
            return;
          }
          addCardToHand(filteredCards[0]);
          setQuery("");
        }}
      >
        <input
          onFocus={() => {
            setSelectedShapeIds([]);
          }}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
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
            const tooltipFaces = getCardTooltipFaces(card);
            const showTooltip = tooltipFaces.length > 0;
            return (
              <button
                key={card.id}
                type="button"
                className="card-search-item"
                onClick={() => addCardToHand(card)}
                onMouseEnter={(event) => {
                  setPreviewCard(card);
                  positionCardTooltip(event);
                }}
                onMouseMove={positionCardTooltip}
                onFocus={(event) => {
                  setPreviewCard(card);
                  positionCardTooltip(event);
                }}
              >
                <img src={image} alt={card.name} />
                <span>{card.name}</span>
                {showTooltip && (
                  <div className="card-search-tooltip" role="tooltip">
                    {tooltipFaces.map((face, index) => (
                      <div
                        key={`${card.id}-face-${index}`}
                        className="card-search-tooltip__face"
                      >
                        <div className="card-search-tooltip__header">
                          <span className="card-search-tooltip__name">
                            {face.name}
                          </span>
                          {face.manaCost && (
                            <span className="card-search-tooltip__mana">
                              {face.manaCost}
                            </span>
                          )}
                        </div>
                        {face.typeLine && (
                          <div className="card-search-tooltip__type">
                            {face.typeLine}
                          </div>
                        )}
                        {face.oracleText && (
                          <div className="card-search-tooltip__text">
                            {face.oracleText}
                          </div>
                        )}
                        {face.power && face.toughness && (
                          <div className="card-search-tooltip__pt">
                            {face.power}/{face.toughness}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
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
          <img src={previewImage} alt={previewCard?.name ?? "Card preview"} />
        </div>
      )}
    </div>
  );
};

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
  const [copied, setCopied] = React.useState(false);
  const [isMobile, setIsMobile] = React.useState(() =>
    typeof window === "undefined"
      ? false
      : window.matchMedia("(max-width: 720px)").matches
  );

  // Modal state
  const [modal, showModal] = useModal();

  // Shape state
  const setSelectedShapeIds = useShapeStore(
    (state) => state.setSelectedShapeIds
  );

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

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia("(max-width: 720px)");
    const handleChange = (event: MediaQueryListEvent) => {
      setIsMobile(event.matches);
    };
    media.addEventListener("change", handleChange);
    return () => media.removeEventListener("change", handleChange);
  }, []);


  const deckCount = deck?.length ?? 0;
  const canCopyPeerId = Boolean(peer?.id);

  const handleCopyPeerId = () => {
    if (!peer?.id) return;
    navigator.clipboard.writeText(peer.id);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const openConnectModal = () => {
    showModal(
      "Connect",
      (closeModal) => (
        <ConnectModal
          onConnect={(peerId) => {
            connectToPeer(peerId);
            closeModal();
          }}
        />
      ),
      true
    );
  };

  const openCardSearchModal = () => {
    showModal(
      "Card Search",
      () => (
        <CardSearchModal
          cards={uniqueCards}
          addCardToHand={addCardToHand}
          setSelectedShapeIds={setSelectedShapeIds}
          isMobile={isMobile}
        />
      ),
      true
    );
  };

  return (
    <div className="selection-panel selection-panel--integrated">
      <div className="selection-panel__group selection-panel__group--top-left">
        <button
          className="selection-panel__pill"
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
          Change Deck
        </button>
        <button className="selection-panel__pill" onClick={openConnectModal}>
          Connect
        </button>
      </div>

      <div className="selection-panel__group selection-panel__group--top-right">
        <div className="peer-id-inline">
          <span className="peer-id-inline__label">id:</span>
          <span className="peer-id-inline__value">
            {peer?.id ?? "waiting..."}
          </span>
        </div>
        <button
          className="selection-panel__pill"
          onClick={handleCopyPeerId}
          disabled={!canCopyPeerId}
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>

      <div className="selection-panel__group selection-panel__group--left">
        <button className="selection-panel__pill danger" onClick={onMulligan}>
          Mulligan
        </button>
      </div>

      <div className="selection-panel__group selection-panel__group--left-deck">
        <button className="selection-panel__pill" onClick={onShuffleDeck}>
          Shuffle
        </button>
        {allCards && allCards.length > 0 && (
          <button
            className="selection-panel__pill"
            type="button"
            onClick={openCardSearchModal}
          >
            Search
          </button>
        )}
        <button className="deck-draw-button" onClick={onDrawCard}>
          <span className="deck-count">{deckCount}</span>
          <span className="deck-label">Draw</span>
        </button>
      </div>

      <div className="selection-panel__group selection-panel__group--right">
          <div className="shape-type-options shape-type-options--vertical">
          <div className="shape-type-option" data-tooltip="Select / Move">
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
          <div className="shape-type-option" data-tooltip="Text">
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
          <div className="shape-type-option" data-tooltip="Token">
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
          <div className="shape-type-option" data-tooltip="Rectangle">
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

      {/* Modal Display */}
      {modal}
    </div>
  );
}

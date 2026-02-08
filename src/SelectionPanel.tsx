import React from "react";
import { useLocation, Form } from "react-router-dom";
import useModal from "./hooks/useModal";
import { usePeerStore } from "./hooks/usePeerConnection";
import { useShapeStore } from "./hooks/useShapeStore";
import { Datum } from "./hooks/useCards";
import { Camera, Mode, Card, ShapeType } from "./types/canvas";

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
    <div className="peer-connect-modal flex flex-col gap-3">
      <form
        className="peer-connection peer-connection--modal grid grid-cols-[1fr_auto] gap-1"
        onSubmit={(event) => {
          event.preventDefault();
          if (!trimmedValue) return;
          onConnect(trimmedValue);
        }}
      >
        <input
          type="text"
          className="win-input px-2 py-1.5 text-[10px]"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="Friend's peer ID"
        />
        <button className="success" type="submit" disabled={!trimmedValue}>
          Connect
        </button>
      </form>
      <div className="peer-connect-hint text-[11px] text-win-text-subtle">
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
    <div className="card-search-panel card-search-panel--modal flex flex-col gap-3 w-[min(980px,92vw)] max-h-[min(80vh,720px)]">
      <form
        className="card-search-controls card-search-controls--modal grid grid-cols-[1fr_auto] gap-2"
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
          className="win-input flex-1 w-full px-2 py-1.5 text-[10px]"
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
      <div className="card-search-content card-search-content--modal flex flex-1 flex-col gap-2 max-h-[min(60vh,520px)] overflow-y-auto overflow-x-visible">
        <div
          className="card-search-results card-search-results--modal grid grid-cols-[repeat(auto-fill,minmax(110px,1fr))] gap-2 overflow-visible"
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
                className="card-search-item win-bevel flex flex-col gap-1 rounded bg-win-surface p-1 text-center cursor-pointer transition-[transform,box-shadow] duration-150 relative overflow-visible hover:bg-white focus-visible:bg-white focus-visible:outline-none"
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
                <img className="w-full h-auto rounded-[6px] object-cover shadow-[0_2px_6px_rgba(0,0,0,0.12)]" src={image} alt={card.name} />
                <span className="text-[9px] text-[#374151] leading-[1.2]">{card.name}</span>
                {showTooltip && (
                  <div className="card-search-tooltip fixed left-0 top-0 z-(--z-tooltip) w-[min(260px,60vw)] rounded-sm border border-black bg-[#ffffe1] px-3 py-2.5 text-left text-[10px] leading-[1.35] text-win-text opacity-0 pointer-events-none -translate-y-1 transition-[opacity,transform] duration-150 shadow-none" role="tooltip">
                    {tooltipFaces.map((face, index) => (
                      <div
                        key={`${card.id}-face-${index}`}
                        className="card-search-tooltip__face"
                      >
                        <div className="card-search-tooltip__header flex justify-between gap-2 font-bold mb-1">
                          <span className="card-search-tooltip__name text-[11px]">
                            {face.name}
                          </span>
                          {face.manaCost && (
                            <span className="card-search-tooltip__mana text-[10px] text-win-text-muted whitespace-nowrap">
                              {face.manaCost}
                            </span>
                          )}
                        </div>
                        {face.typeLine && (
                          <div className="card-search-tooltip__type font-semibold text-win-text-muted mb-1">
                            {face.typeLine}
                          </div>
                        )}
                        {face.oracleText && (
                          <div className="card-search-tooltip__text whitespace-pre-line text-win-text">
                            {face.oracleText}
                          </div>
                        )}
                        {face.power && face.toughness && (
                          <div className="card-search-tooltip__pt mt-1 font-semibold text-win-text-muted">
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
            <div className="card-search-empty text-[10px] text-win-text-subtle p-1.5">No matches.</div>
          )}
        </div>
      </div>
      {isCommandPressed && previewImage && (
        <div className="card-search-zoom fixed top-3 right-3 z-(--z-card-search-zoom) h-[420px] rounded-xl border border-black/20 bg-white p-1.5 shadow-[0_10px_24px_rgba(0,0,0,0.25)] pointer-events-none">
          <img className="h-full w-auto rounded-lg block" src={previewImage} alt={previewCard?.name ?? "Card preview"} />
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
  isGridVisible,
  isSnapEnabled,
  onToggleGrid,
  onToggleSnap,
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
  isGridVisible: boolean;
  isSnapEnabled: boolean;
  onToggleGrid: () => void;
  onToggleSnap: () => void;
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
    <div className="selection-panel selection-panel--integrated fixed inset-0 z-(--z-selection-panel) pointer-events-none text-win-text font-win p-0">
      <div className="selection-panel__group selection-panel__group--top-left absolute flex items-center gap-2.5 pointer-events-auto top-4 left-4">
        <button
          className="selection-panel__pill"
          onClick={() =>
            showModal("Select deck", (closeModal) => (
              <Form
                className="modal-form flex flex-col gap-2.5 rounded-sm bg-[#f5f5f5] p-3 win-inset-shadow"
                onSubmit={() => {
                  closeModal();
                }}
              >
                <textarea
                  id="deck"
                  name="deck"
                  className="win-input w-full h-[100px] p-2.5 rounded-sm resize-none font-[Courier_New,Lucida_Console,monospace]"
                  defaultValue={d ?? ""}
                  placeholder={`1 Legion Angel
3 Wedding Announcement
...`}
                />
                <button className="modal-button win-button self-end px-5 py-2.5" type="submit">
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

      <div className="selection-panel__group selection-panel__group--top-right absolute flex items-center gap-2.5 pointer-events-auto top-4 right-4 justify-end">
        <div className="peer-id-inline flex items-center gap-1.5 text-xs font-semibold text-win-text">
          <span className="peer-id-inline__label lowercase font-semibold">id:</span>
          <span className="peer-id-inline__value font-mono-win text-[11px] max-w-[240px] overflow-hidden text-ellipsis whitespace-nowrap">
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

      <div className="selection-panel__group selection-panel__group--left absolute flex flex-col items-start gap-3.5 pointer-events-auto top-[130px] left-4">
        <button className="selection-panel__pill danger" onClick={onMulligan}>
          Mulligan
        </button>
      </div>

      <div className="selection-panel__group selection-panel__group--left-deck absolute flex flex-col items-start gap-2.5 pointer-events-auto left-4 bottom-[120px]">
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
        <button className="deck-draw-button win-bevel flex h-[150px] w-[120px] flex-col items-center justify-center gap-1.5 rounded-lg bg-win-hover font-bold text-win-text shadow-[inset_1px_1px_0_#ffffff,inset_-1px_-1px_0_#9a9a9a] transition-[background,border-color] duration-100 hover:bg-[#f5f5f5] active:win-bevel-pressed" onClick={onDrawCard}>
          <span className="deck-count text-base text-win-text">{deckCount}</span>
          <span className="deck-label inline-flex items-center gap-1.5 text-xs uppercase tracking-[0.04em] text-win-text">
            Draw
            <span className="deck-shortcut win-bevel inline-flex min-w-[18px] items-center justify-center rounded bg-[#e8e0cf] px-[5px] py-px text-[10px] tracking-[0.02em] text-win-text shadow-[inset_1px_1px_0_#ffffff,inset_-1px_-1px_0_#9a9a9a]">D</span>
          </span>
        </button>
      </div>

      <div className="selection-panel__group selection-panel__group--right absolute flex flex-col items-center gap-3 pointer-events-auto top-[140px] right-4">
          <div className="shape-type-options shape-type-options--vertical flex flex-col items-center gap-2.5">
          <div className="shape-type-option win-bevel-raised relative flex min-h-[44px] min-w-[44px] w-14 h-14 cursor-pointer items-center justify-center rounded-[6px] bg-win-button text-win-text transition-[background,border-color] duration-100 hover:bg-win-panel" data-tooltip="Select / Move">
            <input
              type="radio"
              id="select"
              name="action"
              value="select"
              checked={mode === "select"}
              onChange={() => setMode("select")}
            />
            <label htmlFor="select" className="flex flex-col items-center gap-0.5 cursor-pointer w-full">
              <span className="tool-icon text-[18px] font-semibold leading-none">&gt;</span>
            </label>
          </div>
          <div className="shape-type-option win-bevel-raised relative flex min-h-[44px] min-w-[44px] w-14 h-14 cursor-pointer items-center justify-center rounded-[6px] bg-win-button text-win-text transition-[background,border-color] duration-100 hover:bg-win-panel" data-tooltip="Text">
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
            <label htmlFor="create" className="flex flex-col items-center gap-0.5 cursor-pointer w-full">
              <span className="tool-icon text-[18px] font-semibold leading-none">T</span>
            </label>
          </div>
          <div className="shape-type-option win-bevel-raised relative flex min-h-[44px] min-w-[44px] w-14 h-14 cursor-pointer items-center justify-center rounded-[6px] bg-win-button text-win-text transition-[background,border-color] duration-100 hover:bg-win-panel" data-tooltip="Token">
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
            <label htmlFor="add" className="flex flex-col items-center gap-0.5 cursor-pointer w-full">
              <span className="tool-icon text-[18px] font-semibold leading-none">O</span>
            </label>
          </div>
          <div className="shape-type-option win-bevel-raised relative flex min-h-[44px] min-w-[44px] w-14 h-14 cursor-pointer items-center justify-center rounded-[6px] bg-win-button text-win-text transition-[background,border-color] duration-100 hover:bg-win-panel" data-tooltip="Rectangle">
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
            <label htmlFor="rectangle" className="flex flex-col items-center gap-0.5 cursor-pointer w-full">
              <span className="tool-icon text-[18px] font-semibold leading-none">[]</span>
            </label>
          </div>
        </div>
        <div className="selection-panel__grid-controls flex flex-col items-center gap-1.5">
          <button
            type="button"
            className={`selection-panel__pill min-w-[56px] text-center px-2 py-1.5 ${isGridVisible ? "is-active" : ""}`}
            onClick={onToggleGrid}
            aria-pressed={isGridVisible}
            title="Toggle grid"
          >
            Grid
          </button>
          <button
            type="button"
            className={`selection-panel__pill min-w-[56px] text-center px-2 py-1.5 ${isSnapEnabled ? "is-active" : ""}`}
            onClick={onToggleSnap}
            aria-pressed={isSnapEnabled}
            title="Toggle snapping"
          >
            Snap
          </button>
        </div>
      </div>

      {/* Modal Display */}
      {modal}
    </div>
  );
}

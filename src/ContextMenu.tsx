import {
  ContextMenuCategory,
  ContextMenuDivider,
  ContextMenuItem,
  useContextMenu,
} from "use-context-menu";
import "use-context-menu/styles.css";

interface ContextMenuProps {
  onEngageDisengageCard: () => void;
  children: React.ReactNode;
  onFlip: () => void;
  sendBackToHand: () => void;
  copy: () => void;
  // giveCardToOpponent: () => void;
  sendCardToFront: () => void;
  sendCardToBack: () => void;
  increaseSrcIndex: () => void;
  sendBackToDeck: (position: "top" | "bottom") => void;
  onManageCounters: () => void;
  onClearCounters: () => void;
}

export default function ContextMenu({
  onEngageDisengageCard,
  children,
  onFlip,
  sendBackToDeck,
  sendBackToHand,
  copy,
  // giveCardToOpponent,
  sendCardToFront,
  sendCardToBack,
  increaseSrcIndex,
  onManageCounters,
  onClearCounters,
}: ContextMenuProps) {
  const { contextMenu, onContextMenu } = useContextMenu(
    <div className="custom-context-menu flex flex-col gap-0.5 py-1.5">
      <ContextMenuCategory>Card actions</ContextMenuCategory>
      <ContextMenuItem>
        <button onClick={onEngageDisengageCard}>Engage/Disengage</button>
      </ContextMenuItem>
      <ContextMenuItem>
        <button onClick={onFlip}>Flip</button>
      </ContextMenuItem>
      <ContextMenuItem>
        <button onClick={() => sendBackToDeck("bottom")}>
          Send to bottom of Deck
        </button>
      </ContextMenuItem>
      <ContextMenuItem>
        <button onClick={() => sendBackToDeck("top")}>
          Send to top of Deck
        </button>
      </ContextMenuItem>
      <ContextMenuItem>
        <button onClick={sendBackToHand}>Send to Hand</button>
      </ContextMenuItem>
      <ContextMenuItem>
        <button onClick={copy}>Copy</button>
      </ContextMenuItem>
      <ContextMenuItem>
        <button onClick={increaseSrcIndex}>Transform</button>
      </ContextMenuItem>
      {/* <ContextMenuItem>
        <button onClick={giveCardToOpponent}>Give Card to Opponent</button>
      </ContextMenuItem> */}
      <ContextMenuDivider />
      <ContextMenuCategory>Counters</ContextMenuCategory>
      <ContextMenuItem>
        <button onClick={onManageCounters}>Manage Counters...</button>
      </ContextMenuItem>
      <ContextMenuItem>
        <button onClick={onClearCounters}>Clear All Counters</button>
      </ContextMenuItem>
      <ContextMenuDivider />
      <ContextMenuCategory>Card position</ContextMenuCategory>
      <ContextMenuItem>
        <button onClick={sendCardToFront}>Bring to front</button>
      </ContextMenuItem>
      <ContextMenuItem>
        <button onClick={sendCardToBack}>Bring to back</button>
      </ContextMenuItem>
    </div>
  );

  return (
    <>
      <div onContextMenu={onContextMenu} tabIndex={0}>
        {children}
      </div>
      {contextMenu}
    </>
  );
}

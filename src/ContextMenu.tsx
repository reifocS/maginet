import {
  ContextMenuCategory,
  ContextMenuDivider,
  ContextMenuItem,
  useContextMenu,
} from "use-context-menu";
import "use-context-menu/styles.css";
import "./ContextMenu.css";

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
  sendBackToDeck: () => void;
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
}: ContextMenuProps) {
  const { contextMenu, onContextMenu } = useContextMenu(
    <div className="custom-context-menu">
      <ContextMenuCategory>Card actions</ContextMenuCategory>
      <ContextMenuItem>
        <button onClick={onEngageDisengageCard}>Engage/Disengage</button>
      </ContextMenuItem>
      <ContextMenuItem>
        <button onClick={onFlip}>Flip</button>
      </ContextMenuItem>
      <ContextMenuItem>
        <button onClick={sendBackToDeck}>
          Remove from Canvas
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

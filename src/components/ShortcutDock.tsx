import { KEYBOARD_SHORTCUT_SECTIONS } from "../constants/game";
import Button from "./ui/Button";
import useWindowDrag from "./ui/useWindowDrag";

interface ShortcutDockProps {
  isMobile: boolean;
  isOpen: boolean;
  onToggle: () => void;
}

export default function ShortcutDock({
  isMobile,
  isOpen,
  onToggle,
}: ShortcutDockProps) {
  const { dragOffset, isDragging, onDragHandlePointerDown } = useWindowDrag();

  if (isMobile) return null;

  if (!isOpen) {
    return (
      <Button
        type="button"
        variant="bevelRaised"
        className="shortcut-dock-toggle fixed z-(--z-shortcut-dock) rounded px-2.5 py-1.5 text-xs font-bold font-win text-win-text hover:bg-win-hover"
        onClick={onToggle}
      >
        Shortcuts
      </Button>
    );
  }

  return (
    <div
      className="shortcut-dock win-panel fixed z-(--z-shortcut-dock) w-[280px] max-h-[calc(100vh-240px)] p-2.5 text-xs overflow-y-auto overflow-x-hidden"
      onPointerDown={(event) => event.stopPropagation()}
      onWheel={(event) => event.stopPropagation()}
      style={{
        transform: `translate(${dragOffset.x}px, ${dragOffset.y}px)`,
      }}
    >
      <div
        className={`shortcut-dock__header win-titlebar -mx-2.5 -mt-2.5 mb-2 flex items-center justify-between px-2 py-1.5 text-xs font-bold select-none touch-none ${isDragging ? "cursor-grabbing" : "cursor-grab"}`}
        onPointerDown={onDragHandlePointerDown}
      >
        <span>Shortcuts</span>
        <Button
          type="button"
          variant="bevel"
          data-drag-ignore="true"
          className="shortcut-dock__close inline-flex h-[18px] w-[18px] items-center justify-center rounded-sm p-0 text-xs leading-none text-win-text hover:bg-win-hover active:win-bevel-pressed"
          onClick={onToggle}
          aria-label="Hide shortcuts"
          title="Hide shortcuts"
        >
          ×
        </Button>
      </div>
      <div className="shortcut-dock__content flex flex-col gap-2.5">
        {KEYBOARD_SHORTCUT_SECTIONS.map((section) => (
          <div key={section.title} className="shortcut-dock__section flex flex-col gap-1">
            <div className="shortcut-dock__title text-[11px] font-bold uppercase tracking-[0.03em]">{section.title}</div>
            <div className="shortcut-dock__items ml-2 flex flex-col gap-0.5 leading-[1.4]">
              {section.items.map((item) => (
                <div
                  key={`${section.title}-${item}`}
                  className="shortcut-dock__item text-[11px]"
                >
                  - {item}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

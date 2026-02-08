import { KEYBOARD_SHORTCUT_SECTIONS } from "../constants/game";

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
  if (isMobile) return null;

  if (!isOpen) {
    return (
      <button
        type="button"
        className="shortcut-dock-toggle win-bevel-raised fixed z-(--z-shortcut-dock) rounded bg-win-button px-2.5 py-1.5 text-xs font-bold cursor-pointer font-win text-win-text hover:bg-win-hover"
        onClick={onToggle}
      >
        Shortcuts
      </button>
    );
  }

  return (
    <div
      className="shortcut-dock win-panel fixed z-(--z-shortcut-dock) w-[280px] max-h-[calc(100vh-240px)] p-2.5 text-xs overflow-y-auto overflow-x-hidden"
      onPointerDown={(event) => event.stopPropagation()}
      onWheel={(event) => event.stopPropagation()}
    >
      <div className="shortcut-dock__header win-titlebar -mx-2.5 -mt-2.5 mb-2 flex items-center justify-between px-2 py-1.5 text-xs font-bold">
        <span>Shortcuts</span>
        <button
          type="button"
          className="shortcut-dock__close win-bevel inline-flex h-[18px] w-[18px] cursor-pointer items-center justify-center rounded-sm bg-win-button p-0 text-xs leading-none text-win-text hover:bg-win-hover active:win-bevel-pressed"
          onClick={onToggle}
          aria-label="Hide shortcuts"
          title="Hide shortcuts"
        >
          ×
        </button>
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

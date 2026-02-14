import type { ShortcutSection } from "../../types/canvas";
import {
  PRIMARY_HELP_SHORTCUT_SECTIONS,
  OTHER_HELP_SHORTCUT_SECTION,
} from "../constants/game";
import Button from "../../components/ui/Button";
import useWindowDrag from "../../components/ui/useWindowDrag";

interface HelpPanelProps {
  showHelp: boolean;
  onToggleHelp: () => void;
}

const HELP_TIP_SECTIONS: ShortcutSection[] = [
  {
    title: "Multiplayer",
    items: [
      "Copy your ID in Multiplayer (left sidebar) and share it",
      "Paste a friend's ID into the Multiplayer field",
      "Click Connect to sync boards",
    ],
  },
  {
    title: "Deck",
    items: [
      "In Deck (left sidebar)",
      "Click Select Deck",
      "Paste your decklist and click Submit",
    ],
  },
  {
    title: "How to Play",
    items: ["The rules of Magic stay the same - Maginet is a shared table."],
  },
];

const splitBinding = (item: string) => {
  const separatorIndex = item.indexOf("=");
  if (separatorIndex <= 0) return null;
  const binding = item.slice(0, separatorIndex).trim();
  const description = item.slice(separatorIndex + 1).trim();
  if (!binding || !description) return null;
  return { binding, description };
};

function renderShortcutSection(section: ShortcutSection) {
  return (
    <section
      key={section.title}
      className="help-section win-bevel-inset rounded-sm bg-[#efefef] px-2.5 py-2"
    >
      <h4 className="m-0 mb-2 text-[10px] font-bold uppercase tracking-[0.08em] text-win-text-muted">
        {section.title}
      </h4>
      <div className="flex flex-col gap-1.5">
        {section.items.map((item) => {
          const binding = splitBinding(item);
          if (binding) {
            return (
              <div
                key={`${section.title}-${item}`}
                className="grid grid-cols-[auto_1fr] items-start gap-2"
              >
                <span className="win-bevel-inset inline-flex items-center rounded-sm bg-[#f7f7f7] px-1.5 py-1 text-[10px] font-bold leading-none text-win-text">
                  {binding.binding}
                </span>
                <span className="text-[11px] leading-[1.35] text-win-text">
                  {binding.description}
                </span>
              </div>
            );
          }
          return (
            <div
              key={`${section.title}-${item}`}
              className="flex items-start gap-2 text-[11px] leading-[1.35] text-win-text"
            >
              <span className="mt-[5px] inline-block h-1.5 w-1.5 rounded-full bg-[#666]" />
              <span>{item}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function renderTipSection(section: ShortcutSection) {
  return (
    <section
      key={section.title}
      className="help-section rounded-sm border border-win-border-mid bg-[#f4f4f4] px-2.5 py-2"
    >
      <h4 className="m-0 mb-2 text-[10px] font-bold uppercase tracking-[0.08em] text-win-text-muted">
        {section.title}
      </h4>
      <div className="flex flex-col gap-1.5">
        {section.items.map((item) => (
          <div
            key={`${section.title}-${item}`}
            className="flex items-start gap-2 text-[11px] leading-[1.35] text-win-text"
          >
            <span className="mt-[5px] inline-block h-1.5 w-1.5 rounded-full bg-[#666]" />
            <span>{item}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

export default function HelpPanel({ showHelp, onToggleHelp }: HelpPanelProps) {
  const { dragOffset, isDragging, onDragHandlePointerDown } = useWindowDrag();

  if (!showHelp) return null;

  return (
    <div
      className="help-dialog win-panel fixed top-[60px] left-5 max-[720px]:left-2.5 max-[720px]:right-2.5 max-[720px]:top-[50px] max-[720px]:max-w-[calc(100vw-20px)] max-[720px]:max-h-[calc(100vh-100px)] z-(--z-help-dialog) flex max-h-[calc(100vh-120px)] w-[min(420px,calc(100vw-24px))] flex-col overflow-hidden p-0 text-[13px]"
      onWheel={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      style={{
        transform: `translate(${dragOffset.x}px, ${dragOffset.y}px)`,
      }}
    >
      <div
        className={`help-dialog-title win-titlebar flex items-center justify-between gap-2 px-2.5 py-1.5 text-[13px] select-none touch-none ${isDragging ? "cursor-grabbing" : "cursor-grab"}`}
        onPointerDown={onDragHandlePointerDown}
      >
        <h3 className="m-0 text-[13px] font-bold">Canvas Controls</h3>
        <Button
          type="button"
          variant="bevel"
          data-drag-ignore="true"
          className="help-dialog-header-close inline-flex h-[18px] w-[18px] items-center justify-center rounded-sm p-0 text-xs leading-none text-win-text hover:bg-win-hover active:win-bevel-pressed"
          onClick={onToggleHelp}
          aria-label="Close help"
          title="Close help"
        >
          ×
        </Button>
      </div>

      <div className="help-dialog-content min-h-0 flex flex-col gap-2.5 overflow-y-auto px-3.5 pb-3.5 pt-2.5">
        <div className="rounded-sm border border-win-border-mid bg-[#e9e9e9] px-2.5 py-2 text-[11px] leading-[1.35] text-win-text-muted">
          Quick reference for camera controls, card actions, and table setup.
        </div>

        {PRIMARY_HELP_SHORTCUT_SECTIONS.map(renderShortcutSection)}

        {OTHER_HELP_SHORTCUT_SECTION && renderShortcutSection(OTHER_HELP_SHORTCUT_SECTION)}

        {HELP_TIP_SECTIONS.map(renderTipSection)}
      </div>
    </div>
  );
}

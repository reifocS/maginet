import type { ShortcutSection } from "../types/canvas";
import {
  PRIMARY_HELP_SHORTCUT_SECTIONS,
  OTHER_HELP_SHORTCUT_SECTION,
} from "../constants/game";

interface HelpPanelProps {
  showHelp: boolean;
  onToggleHelp: () => void;
}

function renderShortcutSection(section: ShortcutSection) {
  return (
    <div key={section.title} style={{ marginBottom: "16px" }}>
      <h4 style={{ margin: "8px 0 6px", fontSize: "14px", color: "#aaa" }}>
        {section.title}
      </h4>
      <div style={{ marginLeft: "8px", lineHeight: "1.6" }}>
        {section.items.map((item) => (
          <div key={`${section.title}-${item}`}>- {item}</div>
        ))}
      </div>
    </div>
  );
}

export default function HelpPanel({ showHelp, onToggleHelp }: HelpPanelProps) {
  if (!showHelp) return null;

  return (
    <div
      className="help-dialog win-panel fixed top-[60px] left-5 z-(--z-help-dialog) max-w-[360px] max-h-[calc(100vh-120px)] overflow-y-auto p-3.5 pt-1.5 text-[13px]"
      onWheel={(e) => e.stopPropagation()}
    >
      <h3 className="help-dialog-title win-titlebar -mx-3.5 -mt-1.5 mb-2.5 px-2.5 py-1.5 text-[13px]">
        Canvas Controls
      </h3>

      {PRIMARY_HELP_SHORTCUT_SECTIONS.map(renderShortcutSection)}

      <div style={{ marginBottom: "16px" }}>
        <h4 style={{ margin: "8px 0 6px", fontSize: "14px", color: "#aaa" }}>
          Multiplayer
        </h4>
        <div style={{ marginLeft: "8px", lineHeight: "1.6" }}>
          - Copy your ID in Multiplayer (left sidebar) and share it<br />
          - Paste a friend's ID into the Multiplayer field<br />
          - Click Connect to sync boards<br />
        </div>
      </div>

      <div style={{ marginBottom: "16px" }}>
        <h4 style={{ margin: "8px 0 6px", fontSize: "14px", color: "#aaa" }}>
          Deck
        </h4>
        <div style={{ marginLeft: "8px", lineHeight: "1.6" }}>
          - In Deck (left sidebar)<br />
          - Click Select Deck<br />
          - Paste your decklist and click Submit<br />
        </div>
      </div>

      {OTHER_HELP_SHORTCUT_SECTION && renderShortcutSection(OTHER_HELP_SHORTCUT_SECTION)}

      <div style={{ marginBottom: "16px" }}>
        <h4 style={{ margin: "8px 0 6px", fontSize: "14px", color: "#aaa" }}>
          How to Play
        </h4>
        <div style={{ marginLeft: "8px", lineHeight: "1.6" }}>
          The rules of Magic stay the same - Maginet just gives you a shared
          virtual table.
        </div>
      </div>

      <button onClick={onToggleHelp} className="help-dialog-close win-button mt-3 w-full rounded-sm px-3 py-1.5 text-xs">
        Close
      </button>
    </div>
  );
}

import type { ShortcutSection } from "../types/canvas";

export const HEARTBEAT_INTERVAL_MS = 5000;
export const HEARTBEAT_STALE_MS = HEARTBEAT_INTERVAL_MS * 3;
export const MAX_ACTION_LOG_ENTRIES = 50;
export const GRID_SIZE = 50;
export const CARD_PREVIEW_SIZE: [number, number] = [100, 100];
export const CARD_BACK_URL = "https://i.imgur.com/LdOBU1I.jpeg";

export const CARD_ACTION_DESCRIPTIONS: Record<string, string> = {
  DRAW_CARD: "drew a card",
  MULLIGAN: "took a mulligan",
  SEND_TO_HAND: "moved cards to hand",
  SEND_TO_DECK: "returned cards to the deck",
  MOVE_HAND_TO_DECK: "returned a card to the deck",
  PLAY_CARD: "played a card",
  ADD_TO_HAND: "searched a card",
  SHUFFLE_DECK: "shuffled the deck",
};

export const HELP_SHORTCUT_SECTIONS: ShortcutSection[] = [
  {
    title: "Panning",
    items: [
      "One-finger drag on empty canvas (touch)",
      "Two-finger drag (touch)",
      "Two-finger scroll (trackpad)",
      "Middle mouse button + drag",
      "Space + drag",
      "Alt + drag",
    ],
  },
  {
    title: "Zooming",
    items: [
      "Pinch (touch)",
      "Pinch gesture (trackpad)",
      "Ctrl + scroll wheel",
      "+ / - keys",
    ],
  },
  {
    title: "Card Actions",
    items: [
      "T = tap/untap selected card",
      "C = manage counters on selected card",
      "D = draw a card",
      "Right-click = action menu",
      "Tap card in hand, then tap canvas to play (touch)",
      "Ctrl + hover = preview",
    ],
  },
  {
    title: "Other",
    items: [
      "Cmd/Ctrl + Z = undo",
      "Shift + Cmd/Ctrl + Z = redo",
      "Backspace = delete selected",
      "? = toggle this help",
    ],
  },
];

export const PRIMARY_HELP_SHORTCUT_SECTIONS = HELP_SHORTCUT_SECTIONS.filter(
  (section) => section.title !== "Other"
);
export const OTHER_HELP_SHORTCUT_SECTION = HELP_SHORTCUT_SECTIONS.find(
  (section) => section.title === "Other"
);

export const KEYBOARD_SHORTCUT_SECTIONS: ShortcutSection[] = [
  {
    title: "Panning",
    items: ["Space + drag", "Alt + drag"],
  },
  {
    title: "Zooming",
    items: ["Ctrl + scroll wheel", "+ / - keys"],
  },
  {
    title: "Card Actions",
    items: [
      "T = tap/untap selected card",
      "C = manage counters on selected card",
      "D = draw a card",
      "Ctrl + hover = preview",
    ],
  },
  {
    title: "Other",
    items: [
      "Cmd/Ctrl + Z = undo",
      "Shift + Cmd/Ctrl + Z = redo",
      "Backspace = delete selected",
      "? = toggle this help",
    ],
  },
];

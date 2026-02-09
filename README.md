# Maginet – Realtime MTG Table

Maginet is a realtime web table for **Magic: The Gathering**.

- Import your deck from a text export (MTGO / MTGA style).
- See your cards as high‑quality images fetched from Scryfall.
- Share your peer ID with friends to sync the battlefield in real time.
- Jump in a voice call (Discord, etc.) and play as if you were around the same table.

> This project is an unofficial fan tool and is not affiliated with Wizards of the Coast or Scryfall.

## Getting Started

### Prerequisites

- Node.js 18+ (or any recent LTS)
- `pnpm` (recommended) or `npm`

### Install dependencies

```bash
pnpm install
# or
npm install
```

### Run the app in development

```bash
pnpm dev
# or
npm run dev
```

Then open the URL shown in the terminal (by default `http://localhost:5173`).

### Build for production

```bash
pnpm build
pnpm preview
```

---

## Importing a Deck

Maginet expects a **text decklist** similar to MTGO / MTGA exports:

```text
4 Lightning Bolt
3 Counterspell
2 Jace, the Mind Sculptor
23 Island
```

Steps:

1. Start the app and wait for the UI to load.
2. On the right side, find the **Deck Management** section.
3. Click **Select Deck** to open the deck modal.
4. Paste your decklist text into the textarea.
5. Click **Submit**.

---

## Multiplayer / Realtime Sync

Maginet uses PeerJS to connect browsers directly.

1. **Each player opens Maginet 2** in their browser.
2. In the **Multiplayer** section (right side):
   - Your own ID appears under **Your ID**.
   - Click **Copy** to put it in your clipboard.
3. **Share your ID** with your friends via chat.
4. Each friend:
   - Pastes your ID into **Enter peer ID**.
   - Clicks **Connect**.

Voice chat is **not** built into the app—use Discord, Teams, etc. alongside Maginet.

---

## How to Play

The rules of Magic stay the same—Maginet just gives you a shared virtual table.

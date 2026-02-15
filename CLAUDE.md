# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Maginet 2 is a real-time web table for Magic: The Gathering with a Windows 95/98 retro aesthetic. Players import decks, play cards on a shared SVG canvas, and sync via peer-to-peer connections (PeerJS/WebRTC).

## Commands

```bash
pnpm install              # install deps (use --force if pnpm store mismatch)
pnpm dev                  # dev server at http://localhost:5173
pnpm build                # tsc + vite build
pnpm lint                 # eslint (--max-warnings 0, strict)
pnpm test                 # vitest unit/integration tests
pnpm test:sync            # run only sync integration tests
pnpm test:e2e             # playwright e2e tests (builds + serves on :4173)
pnpm test:e2e:headed      # e2e with browser visible
pnpm test:e2e:debug       # e2e with Playwright inspector
```

## Architecture

**Stack**: React 19, TypeScript, Vite, Zustand, PeerJS, TanStack Query, Tailwind CSS v4

**Entry**: `src/app/main.tsx` → React Router (single route `/`) → `App.tsx` (QueryClient provider) → `Canvas.tsx`

### Key Directories

```
src/
├── app/             # Entry point, router, App shell (main.tsx, App.tsx, Home.tsx)
├── board/           # Game board — the main UI surface
│   ├── Canvas.tsx   # SVG canvas orchestrating rendering, input, camera, panels
│   ├── Hand.tsx     # Player hand panel
│   ├── Shape.tsx    # Shape wrapper with selection/drag handles
│   ├── inputs.ts    # Pointer/touch input handlers
│   ├── components/  # Board UI: SetupScreen, HelpPanel, SelectionBox, ShortcutDock
│   ├── shapes/      # Shape renderers: ImageShape, TextShape, RectangleShape, TokenShape
│   └── constants/   # Keyboard shortcuts, game constants
├── hooks/           # Custom hooks (state, networking, input, camera)
├── sync/            # P2P sync engine (transport-agnostic)
│   ├── core/        # SyncClient, SyncEnvelope, SyncTransport interface, channels
│   ├── transport/   # PeerJS transport implementation
│   ├── react/       # React bindings (peerStore, shapesChannel, usePeerSync)
│   └── testing/     # In-memory transport for tests
├── components/ui/   # Shared UI primitives
├── types/canvas.ts  # Core types: Shape, Card, Camera, Counter, ShapeType, Mode
├── utils/           # Pure functions (vec math, canvas transforms, game helpers, colors)
├── data/            # Static data (default deck list)
└── styles/          # CSS entry points
e2e/                 # Playwright e2e specs + test utilities
```

### State Management (Zustand)

- **`hooks/useShapeStore.ts`** — Central store for shapes (cards, tokens, text, rectangles on canvas), selection state, undo/redo history (50-entry limit using `structuredClone`). History is skipped during drag/resize/rotate/text-edit.
- **`hooks/useCardReducer.ts`** — Deck and hand state via reducer pattern. Actions: DRAW_CARD, MULLIGAN, SHUFFLE_DECK, SEND_TO_HAND, SEND_TO_DECK, ADD_TO_HAND. Each action increments `actionId` for sync.

### Sync Engine (`src/sync/`)

Transport-agnostic P2P sync layer, separated from React:

- **`core/client.ts`** — `createSyncClient(options)` manages transport lifecycle, message routing, and channel-based state sync. Channels use a diff/patch/snapshot model for efficient updates.
- **`core/envelope.ts`** — `SyncEnvelope<TType, TPayload>` is the wire format for all messages. Includes metadata (version, roomId, from, msgId, ts).
- **`core/client.ts: SyncChannelPlugin`** — Interface for registering state channels: `getState`, `setState`, `diff`, `apply`, `snapshot`, `hydrate`. On new peer connection, full snapshots are sent; local changes are broadcast as patches.
- **`transport/peerjs.ts`** — `createPeerJsTransport()` implements `SyncTransport` using PeerJS DataConnections.
- **`testing/memoryTransport.ts`** — In-memory transport for integration tests.
- **`react/shapesChannel.ts`** — Wires the Zustand shape store to the sync engine as a channel plugin.
- **`react/usePeerSync.ts`** — React hook that ties the sync client lifecycle to components.

### Card Data (`hooks/useCards.ts`)

TanStack Query fetches from Scryfall API (`POST /cards/collection`), batched 75 cards per request. Handles double-faced cards via `card_faces` and `all_parts`.

### Camera (`hooks/useCamera.ts`)

Pan/zoom with smooth damping (SmoothDamp-like easing). Zoom anchored to cursor position. Range: 0.5x–10x.

## Styling

**Tailwind CSS v4** with Win95 theme defined in `src/index.css`:
- `@theme` block defines `--color-win-*` tokens and `--z-*` z-index scale
- `@layer components` defines reusable classes: `.win-bevel`, `.win-button`, `.win-input`, `.win-panel`, `.win-titlebar`
- `src/legacy.css` (~300 lines) handles patterns Tailwind can't express: body `:has()`, `::after content: attr()`, scrollbar styling, complex compound selectors

Win95 bevel pattern: `border-color: #ffffff #5b5b5b #5b5b5b #ffffff` (raised), reversed for pressed.

## Key Types

```typescript
interface Shape {
  id: string; point: number[]; size: number[];
  type: "image" | "text" | "rectangle" | "token" | "circle" | "arrow";
  src?: string[];        // card image URLs (multi-face)
  srcIndex: number;      // current face index
  rotation?: number;     // 0 = untapped, 90 = tapped
  isFlipped?: boolean;
  counters?: Counter[];
  color?: string;        // border outline color
}
```

## Vite Config

React plugin with **babel-plugin-react-compiler** enabled (error-level diagnostics). Tailwind via `@tailwindcss/vite`.

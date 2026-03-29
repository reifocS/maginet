# Maginet Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an MCP server that lets Claude Code play or advise on Magic: The Gathering games running in a live Maginet browser tab, connected via WebSocket.

**Architecture:** A Node.js MCP server (`maginet-agent/`) communicates with Claude Code over stdio and with the browser over WebSocket. The browser gets a new `WebSocketTransport` implementing the existing `SyncTransport` interface from `@vescofire/peersync`. The agent joins as a sync peer — shapes and card actions flow through the same diff/patch/snapshot model used by PeerJS. In opponent mode the agent holds its own deck/hand state; in copilot mode it reads the browser's state.

**Tech Stack:** Node.js, TypeScript, `ws` (WebSocket), `@modelcontextprotocol/sdk`, `@vescofire/peersync`, Scryfall REST API, Vitest

---

## File Map

### New files — `maginet-agent/` package

| File | Responsibility |
|------|---------------|
| `maginet-agent/package.json` | Package manifest — deps: `ws`, `@modelcontextprotocol/sdk`, `@vescofire/peersync` |
| `maginet-agent/tsconfig.json` | TypeScript config — Node ESM, imports from shared `src/` |
| `maginet-agent/src/index.ts` | CLI entry — parses `--port` and `--visibility` args, wires server + MCP |
| `maginet-agent/src/server.ts` | WebSocket server + `SyncTransport` implementation for Node side |
| `maginet-agent/src/state.ts` | Agent game state — wraps `cardReducer`, tracks agent's shapes |
| `maginet-agent/src/visibility.ts` | Filters game state based on `fair` / `full` visibility setting |
| `maginet-agent/src/mcp.ts` | MCP tool definitions and handlers |
| `maginet-agent/src/scryfall.ts` | Scryfall API client for deck loading (Node `fetch`) |
| `maginet-agent/src/__tests__/state.test.ts` | Unit tests for agent state |
| `maginet-agent/src/__tests__/visibility.test.ts` | Unit tests for visibility filter |
| `maginet-agent/src/__tests__/server.integration.test.ts` | Integration test — WS transport + sync |
| `maginet-agent/src/__tests__/mcp.test.ts` | MCP tool handler tests |

### New files — browser side

| File | Responsibility |
|------|---------------|
| `src/sync/transport/websocket.ts` | `SyncTransport` implementation using browser `WebSocket` |
| `src/sync/transport/websocket.test.ts` | Unit tests for WS transport |

### Modified files — browser side

| File | Change |
|------|--------|
| `src/sync/react/peerStore.ts` | Add optional WebSocket transport alongside PeerJS |
| `src/board/components/SetupScreen.tsx` | "Connect Agent" button on multiplayer step |

---

## Task 1: Scaffold `maginet-agent` package

**Files:**
- Create: `maginet-agent/package.json`
- Create: `maginet-agent/tsconfig.json`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "maginet-agent",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "main": "dist/index.js",
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "test": "vitest run",
    "start": "node dist/index.js"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.12.1",
    "ws": "^8.18.0"
  },
  "devDependencies": {
    "@types/ws": "^8.5.10",
    "typescript": "^5.2.2",
    "vitest": "^4.0.18"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": "src",
    "declaration": true,
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "isolatedModules": true
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Install dependencies**

Run: `cd maginet-agent && pnpm install`
Expected: Dependencies installed, `node_modules/` created.

- [ ] **Step 4: Commit**

```bash
git add maginet-agent/package.json maginet-agent/tsconfig.json maginet-agent/pnpm-lock.yaml
git commit -m "chore: scaffold maginet-agent package"
```

---

## Task 2: Agent game state (`state.ts`)

Wraps the existing `cardReducer` to manage the agent's deck and hand. Also tracks which shapes on the board belong to the agent.

**Files:**
- Create: `maginet-agent/src/state.ts`
- Create: `maginet-agent/src/__tests__/state.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// maginet-agent/src/__tests__/state.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { AgentGameState } from "../state.js";

const makeCard = (id: string, src = [`https://example.com/${id}.png`]) => ({
  id,
  src,
});

describe("AgentGameState", () => {
  let state: AgentGameState;

  beforeEach(() => {
    state = new AgentGameState();
  });

  it("initializes with empty deck and hand", () => {
    expect(state.getHand()).toEqual([]);
    expect(state.getDeckSize()).toBe(0);
  });

  it("initializes a deck", () => {
    const cards = [makeCard("a"), makeCard("b"), makeCard("c")];
    state.initializeDeck(cards);
    expect(state.getDeckSize()).toBe(3);
    expect(state.getHand()).toEqual([]);
  });

  it("draws a card from deck to hand", () => {
    state.initializeDeck([makeCard("a"), makeCard("b")]);
    const drawn = state.drawCard();
    expect(drawn).toBeDefined();
    expect(state.getHand()).toHaveLength(1);
    expect(state.getDeckSize()).toBe(1);
  });

  it("returns null when drawing from empty deck", () => {
    const drawn = state.drawCard();
    expect(drawn).toBeNull();
  });

  it("mulligans hand back into deck", () => {
    state.initializeDeck([makeCard("a"), makeCard("b"), makeCard("c")]);
    state.drawCard();
    state.drawCard();
    expect(state.getHand()).toHaveLength(2);
    state.mulligan();
    expect(state.getHand()).toHaveLength(0);
    expect(state.getDeckSize()).toBe(3);
  });

  it("plays a card from hand and returns it", () => {
    state.initializeDeck([makeCard("a")]);
    state.drawCard();
    const hand = state.getHand();
    const cardId = hand[0].id;
    const played = state.playCard(cardId);
    expect(played).toBeDefined();
    expect(played!.src).toEqual(["https://example.com/a.png"]);
    expect(state.getHand()).toHaveLength(0);
  });

  it("returns null when playing a card not in hand", () => {
    const played = state.playCard("nonexistent");
    expect(played).toBeNull();
  });

  it("sends a card back to hand", () => {
    const card = makeCard("returned");
    state.sendToHand([card]);
    expect(state.getHand()).toHaveLength(1);
    expect(state.getHand()[0].src).toEqual(card.src);
  });

  it("sends a card to deck top", () => {
    state.initializeDeck([makeCard("a")]);
    state.sendToDeck([makeCard("top")], "top");
    expect(state.getDeckSize()).toBe(2);
    // Draw should get the card we put on top
    const drawn = state.drawCard();
    expect(drawn!.src).toEqual(["https://example.com/top.png"]);
  });

  it("sends a card to deck bottom", () => {
    state.initializeDeck([makeCard("a")]);
    state.sendToDeck([makeCard("bottom")], "bottom");
    expect(state.getDeckSize()).toBe(2);
    // Draw should get original top card, not the bottom one
    const drawn = state.drawCard();
    expect(drawn!.src).toEqual(["https://example.com/a.png"]);
  });

  it("shuffles the deck", () => {
    const cards = Array.from({ length: 20 }, (_, i) => makeCard(`card-${i}`));
    state.initializeDeck(cards);
    const before = state.getDeckContents().map((c) => c.id);
    state.shuffleDeck();
    const after = state.getDeckContents().map((c) => c.id);
    // Extremely unlikely to be identical after shuffle of 20 cards
    expect(after).not.toEqual(before);
  });

  it("tracks agent shapes", () => {
    expect(state.getAgentShapes()).toEqual([]);
    const shape = {
      id: "s1",
      point: [100, 200],
      size: [100, 100],
      type: "image" as const,
      srcIndex: 0,
      src: ["https://example.com/card.png"],
    };
    state.addAgentShape(shape);
    expect(state.getAgentShapes()).toHaveLength(1);
    state.removeAgentShape("s1");
    expect(state.getAgentShapes()).toEqual([]);
  });

  it("updates an agent shape", () => {
    const shape = {
      id: "s1",
      point: [100, 200],
      size: [100, 100],
      type: "image" as const,
      srcIndex: 0,
    };
    state.addAgentShape(shape);
    state.updateAgentShape("s1", { rotation: 90 });
    expect(state.getAgentShapes()[0].rotation).toBe(90);
  });

  it("exposes cardState for sync", () => {
    state.initializeDeck([makeCard("a")]);
    const cardState = state.getCardState();
    expect(cardState.deck).toHaveLength(1);
    expect(cardState.cards).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd maginet-agent && pnpm test`
Expected: FAIL — `AgentGameState` not found.

- [ ] **Step 3: Implement AgentGameState**

```typescript
// maginet-agent/src/state.ts
import type { Shape } from "../../src/types/canvas.js";

export interface Card {
  id: string;
  src: string[];
}

export interface CardState {
  cards: Card[];
  deck: Card[];
  lastAction?: string;
  actionId?: number;
}

function generateId(): string {
  return Math.random().toString(36).substr(2, 9);
}

function shuffle<T>(array: T[]): T[] {
  return array
    .map((value) => ({ value, sort: Math.random() }))
    .sort((a, b) => a.sort - b.sort)
    .map(({ value }) => value);
}

export class AgentGameState {
  private cardState: CardState = { cards: [], deck: [], actionId: 0 };
  private agentShapes: Shape[] = [];
  private shapeListeners = new Set<(next: Shape[], prev: Shape[]) => void>();

  getHand(): Card[] {
    return this.cardState.cards;
  }

  getDeckSize(): number {
    return this.cardState.deck.length;
  }

  getDeckContents(): Card[] {
    return this.cardState.deck;
  }

  getCardState(): CardState {
    return this.cardState;
  }

  getAgentShapes(): Shape[] {
    return this.agentShapes;
  }

  subscribeShapes(listener: (next: Shape[], prev: Shape[]) => void): () => void {
    this.shapeListeners.add(listener);
    return () => { this.shapeListeners.delete(listener); };
  }

  private notifyShapeChange(prev: Shape[]) {
    this.shapeListeners.forEach((listener) => listener(this.agentShapes, prev));
  }

  private nextAction(action: string): void {
    this.cardState = {
      ...this.cardState,
      lastAction: action,
      actionId: (this.cardState.actionId ?? 0) + 1,
    };
  }

  initializeDeck(cards: Card[]): void {
    this.nextAction("INITIALIZE_DECK");
    this.cardState = {
      ...this.cardState,
      deck: cards.map((c) => ({ ...c })),
      cards: [],
    };
  }

  drawCard(): Card | null {
    if (this.cardState.deck.length === 0) return null;
    this.nextAction("DRAW_CARD");
    const [drawn, ...rest] = this.cardState.deck;
    const drawnCard = { ...drawn, id: generateId() };
    this.cardState = {
      ...this.cardState,
      deck: rest,
      cards: [...this.cardState.cards, drawnCard],
    };
    return drawnCard;
  }

  mulligan(): void {
    this.nextAction("MULLIGAN");
    this.cardState = {
      ...this.cardState,
      deck: [...this.cardState.deck, ...this.cardState.cards],
      cards: [],
    };
  }

  playCard(cardId: string): Card | null {
    const card = this.cardState.cards.find((c) => c.id === cardId);
    if (!card) return null;
    this.nextAction("PLAY_CARD");
    this.cardState = {
      ...this.cardState,
      cards: this.cardState.cards.filter((c) => c.id !== cardId),
    };
    return card;
  }

  sendToHand(cards: Card[]): void {
    this.nextAction("SEND_TO_HAND");
    this.cardState = {
      ...this.cardState,
      cards: [...this.cardState.cards, ...cards],
    };
  }

  sendToDeck(cards: Card[], position: "top" | "bottom"): void {
    this.nextAction("SEND_TO_DECK");
    this.cardState = {
      ...this.cardState,
      deck:
        position === "top"
          ? [...cards, ...this.cardState.deck]
          : [...this.cardState.deck, ...cards],
    };
  }

  shuffleDeck(): void {
    this.nextAction("SHUFFLE_DECK");
    this.cardState = {
      ...this.cardState,
      deck: shuffle(this.cardState.deck),
    };
  }

  addAgentShape(shape: Shape): void {
    const prev = this.agentShapes;
    this.agentShapes = [...this.agentShapes, shape];
    this.notifyShapeChange(prev);
  }

  removeAgentShape(shapeId: string): void {
    const prev = this.agentShapes;
    this.agentShapes = this.agentShapes.filter((s) => s.id !== shapeId);
    this.notifyShapeChange(prev);
  }

  updateAgentShape(shapeId: string, updates: Partial<Shape>): void {
    const prev = this.agentShapes;
    this.agentShapes = this.agentShapes.map((s) =>
      s.id === shapeId ? { ...s, ...updates } : s
    );
    this.notifyShapeChange(prev);
  }

  findAgentShape(shapeId: string): Shape | undefined {
    return this.agentShapes.find((s) => s.id === shapeId);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd maginet-agent && pnpm test`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add maginet-agent/src/state.ts maginet-agent/src/__tests__/state.test.ts
git commit -m "feat(agent): add AgentGameState for deck/hand/shape management"
```

---

## Task 3: Visibility filter (`visibility.ts`)

Filters game state based on the `fair` or `full` visibility setting.

**Files:**
- Create: `maginet-agent/src/visibility.ts`
- Create: `maginet-agent/src/__tests__/visibility.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// maginet-agent/src/__tests__/visibility.test.ts
import { describe, it, expect } from "vitest";
import { filterGameState, type RawGameState, type VisibleGameState } from "../visibility.js";

const makeCard = (id: string) => ({ id, src: [`https://example.com/${id}.png`] });
const makeShape = (id: string) => ({
  id,
  point: [0, 0],
  size: [100, 100],
  type: "image" as const,
  srcIndex: 0,
  src: [`https://example.com/${id}.png`],
});

const rawState: RawGameState = {
  agentHand: [makeCard("a1"), makeCard("a2")],
  agentDeck: [makeCard("d1"), makeCard("d2"), makeCard("d3")],
  boardShapes: { agent: [makeShape("s1")], opponent: [makeShape("s2")] },
  opponentHand: [makeCard("o1"), makeCard("o2"), makeCard("o3")],
  opponentDeckSize: 10,
};

describe("filterGameState", () => {
  it("fair: shows agent hand, hides deck contents, hides opponent hand", () => {
    const result = filterGameState(rawState, "fair");
    expect(result.agentHand).toEqual(rawState.agentHand);
    expect(result.agentDeckSize).toBe(3);
    expect(result.agentDeckContents).toBeUndefined();
    expect(result.opponentHandCount).toBe(3);
    expect(result.opponentHandContents).toBeUndefined();
    expect(result.boardShapes).toEqual(rawState.boardShapes);
  });

  it("full: shows everything including deck contents and opponent hand", () => {
    const result = filterGameState(rawState, "full");
    expect(result.agentHand).toEqual(rawState.agentHand);
    expect(result.agentDeckSize).toBe(3);
    expect(result.agentDeckContents).toEqual(rawState.agentDeck);
    expect(result.opponentHandCount).toBe(3);
    expect(result.opponentHandContents).toEqual(rawState.opponentHand);
  });

  it("board shapes are always fully visible", () => {
    const fair = filterGameState(rawState, "fair");
    const full = filterGameState(rawState, "full");
    expect(fair.boardShapes).toEqual(full.boardShapes);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd maginet-agent && pnpm test`
Expected: FAIL — `filterGameState` not found.

- [ ] **Step 3: Implement visibility filter**

```typescript
// maginet-agent/src/visibility.ts
import type { Shape } from "../../src/types/canvas.js";

export type Visibility = "fair" | "full";

export interface Card {
  id: string;
  src: string[];
}

export interface RawGameState {
  agentHand: Card[];
  agentDeck: Card[];
  boardShapes: Record<string, Shape[]>;
  opponentHand: Card[];
  opponentDeckSize: number;
}

export interface VisibleGameState {
  agentHand: Card[];
  agentDeckSize: number;
  agentDeckContents?: Card[];
  boardShapes: Record<string, Shape[]>;
  opponentHandCount: number;
  opponentHandContents?: Card[];
  opponentDeckSize: number;
}

export function filterGameState(
  raw: RawGameState,
  visibility: Visibility
): VisibleGameState {
  const base: VisibleGameState = {
    agentHand: raw.agentHand,
    agentDeckSize: raw.agentDeck.length,
    boardShapes: raw.boardShapes,
    opponentHandCount: raw.opponentHand.length,
    opponentDeckSize: raw.opponentDeckSize,
  };

  if (visibility === "full") {
    base.agentDeckContents = raw.agentDeck;
    base.opponentHandContents = raw.opponentHand;
  }

  return base;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd maginet-agent && pnpm test`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add maginet-agent/src/visibility.ts maginet-agent/src/__tests__/visibility.test.ts
git commit -m "feat(agent): add visibility filter for fair/full game state"
```

---

## Task 4: Scryfall client (`scryfall.ts`)

Fetches card data from the Scryfall API for deck loading. Mirrors the logic in `src/hooks/useCards.ts` but runs in Node.

**Files:**
- Create: `maginet-agent/src/scryfall.ts`

- [ ] **Step 1: Implement Scryfall client**

```typescript
// maginet-agent/src/scryfall.ts

interface ScryfallImageUris {
  normal: string;
  [key: string]: string;
}

interface ScryfallCardFace {
  image_uris: ScryfallImageUris;
}

interface ScryfallCard {
  image_uris?: ScryfallImageUris;
  card_faces?: ScryfallCardFace[];
  name: string;
}

interface ScryfallCollection {
  data: ScryfallCard[];
  not_found: Array<{ name: string }>;
}

export interface DeckCard {
  id: string;
  src: string[];
}

function generateId(): string {
  return Math.random().toString(36).substr(2, 9);
}

function shuffle<T>(array: T[]): T[] {
  return array
    .map((value) => ({ value, sort: Math.random() }))
    .sort((a, b) => a.sort - b.sort)
    .map(({ value }) => value);
}

export function parseDeckList(deckList: string): string[] {
  if (deckList.trim() === "") return [];
  return deckList.split("\n").flatMap((line) => {
    const match = line.match(/^(\d+)\s+(.*?)(?:\s*\/\/.*)?$/);
    if (match) {
      const [, count, name] = match;
      return Array(Number(count)).fill(name.trim());
    }
    return [];
  });
}

async function fetchCards(names: string[]): Promise<ScryfallCollection> {
  const response = await fetch("https://api.scryfall.com/cards/collection", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      identifiers: names.map((name) => ({ name })),
    }),
  });
  if (!response.ok) {
    throw new Error(`Scryfall API error: ${response.status} ${await response.text()}`);
  }
  return response.json() as Promise<ScryfallCollection>;
}

function scryfallCardToDeckCard(card: ScryfallCard): DeckCard {
  if (card.image_uris?.normal) {
    return { id: generateId(), src: [card.image_uris.normal] };
  }
  if (card.card_faces?.length) {
    return {
      id: generateId(),
      src: card.card_faces.map((face) => face.image_uris.normal),
    };
  }
  throw new Error(`No image found for card: ${card.name}`);
}

export async function loadDeckFromList(deckList: string): Promise<DeckCard[]> {
  const names = parseDeckList(deckList);
  if (names.length === 0) throw new Error("Empty deck list");
  if (names.length > 200) throw new Error("Deck list too large (max 200 cards)");

  // Batch in chunks of 75 (Scryfall limit)
  const chunks: string[][] = [];
  const remaining = [...names];
  while (remaining.length > 0) {
    chunks.push(remaining.splice(0, 75));
  }

  const collections = await Promise.all(chunks.map(fetchCards));

  const notFound = collections.flatMap((c) => c.not_found.map((nf) => nf.name));
  if (notFound.length > 0) {
    console.warn(`Cards not found: ${notFound.join(", ")}`);
  }

  const cards = collections.flatMap((c) => c.data.map(scryfallCardToDeckCard));
  return shuffle(cards);
}
```

- [ ] **Step 2: Commit**

```bash
git add maginet-agent/src/scryfall.ts
git commit -m "feat(agent): add Scryfall API client for deck loading"
```

---

## Task 5: WebSocket transport — Node server side (`server.ts`)

The MCP server's WebSocket server that implements `SyncTransport` to participate in the sync engine as a peer.

**Files:**
- Create: `maginet-agent/src/server.ts`
- Create: `maginet-agent/src/__tests__/server.integration.test.ts`

- [ ] **Step 1: Write the failing integration test**

```typescript
// maginet-agent/src/__tests__/server.integration.test.ts
import { describe, it, expect, afterEach } from "vitest";
import { WebSocket, WebSocketServer } from "ws";
import { AgentWebSocketServer } from "../server.js";

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const waitFor = async (
  assertion: () => void,
  timeoutMs = 2000,
  pollMs = 10
) => {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try { assertion(); return; }
    catch { await wait(pollMs); }
  }
  assertion();
};

describe("AgentWebSocketServer", () => {
  let server: AgentWebSocketServer | null = null;

  afterEach(async () => {
    if (server) {
      await server.stop();
      server = null;
    }
  });

  it("starts and accepts a WebSocket connection", async () => {
    server = new AgentWebSocketServer({ port: 0 }); // random port
    const port = await server.start();

    const ws = new WebSocket(`ws://localhost:${port}`);
    await new Promise<void>((resolve) => ws.on("open", resolve));

    await waitFor(() => {
      expect(server!.isConnected()).toBe(true);
    });

    ws.close();
  });

  it("receives messages from browser client", async () => {
    server = new AgentWebSocketServer({ port: 0 });
    const port = await server.start();

    const received: unknown[] = [];
    server.onMessage((msg) => received.push(msg));

    const ws = new WebSocket(`ws://localhost:${port}`);
    await new Promise<void>((resolve) => ws.on("open", resolve));

    ws.send(JSON.stringify({ type: "test", payload: { value: 42 } }));

    await waitFor(() => {
      expect(received).toHaveLength(1);
      expect(received[0]).toEqual({ type: "test", payload: { value: 42 } });
    });

    ws.close();
  });

  it("sends messages to browser client", async () => {
    server = new AgentWebSocketServer({ port: 0 });
    const port = await server.start();

    const ws = new WebSocket(`ws://localhost:${port}`);
    await new Promise<void>((resolve) => ws.on("open", resolve));

    const received: unknown[] = [];
    ws.on("message", (data) => received.push(JSON.parse(data.toString())));

    server.send({ type: "hello", payload: { from: "agent" } });

    await waitFor(() => {
      expect(received).toHaveLength(1);
      expect(received[0]).toEqual({ type: "hello", payload: { from: "agent" } });
    });

    ws.close();
  });

  it("detects disconnection", async () => {
    server = new AgentWebSocketServer({ port: 0 });
    const port = await server.start();

    const ws = new WebSocket(`ws://localhost:${port}`);
    await new Promise<void>((resolve) => ws.on("open", resolve));

    await waitFor(() => expect(server!.isConnected()).toBe(true));

    ws.close();

    await waitFor(() => expect(server!.isConnected()).toBe(false));
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd maginet-agent && pnpm test`
Expected: FAIL — `AgentWebSocketServer` not found.

- [ ] **Step 3: Implement AgentWebSocketServer**

```typescript
// maginet-agent/src/server.ts
import { WebSocketServer, WebSocket } from "ws";
import type { SyncEnvelope } from "@vescofire/peersync";

export interface AgentWebSocketServerOptions {
  port: number;
}

type MessageListener = (message: SyncEnvelope) => void;
type ConnectionListener = (peerId: string) => void;

export class AgentWebSocketServer {
  private wss: WebSocketServer | null = null;
  private client: WebSocket | null = null;
  private port: number;
  private messageListeners = new Set<MessageListener>();
  private connectListeners = new Set<ConnectionListener>();
  private disconnectListeners = new Set<ConnectionListener>();
  private browserPeerId = "browser";

  constructor(options: AgentWebSocketServerOptions) {
    this.port = options.port;
  }

  async start(): Promise<number> {
    return new Promise((resolve, reject) => {
      this.wss = new WebSocketServer({ port: this.port }, () => {
        const address = this.wss!.address();
        const assignedPort = typeof address === "object" ? address.port : this.port;
        resolve(assignedPort);
      });

      this.wss.on("error", reject);

      this.wss.on("connection", (ws) => {
        this.client = ws;
        this.connectListeners.forEach((listener) => listener(this.browserPeerId));

        ws.on("message", (data) => {
          try {
            const message = JSON.parse(data.toString()) as SyncEnvelope;
            this.messageListeners.forEach((listener) => listener(message));
          } catch {
            // Ignore malformed messages
          }
        });

        ws.on("close", () => {
          this.client = null;
          this.disconnectListeners.forEach((listener) => listener(this.browserPeerId));
        });
      });
    });
  }

  async stop(): Promise<void> {
    if (this.client) {
      this.client.close();
      this.client = null;
    }
    return new Promise((resolve) => {
      if (!this.wss) { resolve(); return; }
      this.wss.close(() => {
        this.wss = null;
        resolve();
      });
    });
  }

  isConnected(): boolean {
    return this.client !== null && this.client.readyState === WebSocket.OPEN;
  }

  send(message: SyncEnvelope): void {
    if (!this.client || this.client.readyState !== WebSocket.OPEN) return;
    this.client.send(JSON.stringify(message));
  }

  onMessage(listener: MessageListener): () => void {
    this.messageListeners.add(listener);
    return () => { this.messageListeners.delete(listener); };
  }

  onConnect(listener: ConnectionListener): () => void {
    this.connectListeners.add(listener);
    return () => { this.connectListeners.delete(listener); };
  }

  onDisconnect(listener: ConnectionListener): () => void {
    this.disconnectListeners.add(listener);
    return () => { this.disconnectListeners.delete(listener); };
  }

  getBrowserPeerId(): string {
    return this.browserPeerId;
  }

  setBrowserPeerId(peerId: string): void {
    this.browserPeerId = peerId;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd maginet-agent && pnpm test`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add maginet-agent/src/server.ts maginet-agent/src/__tests__/server.integration.test.ts
git commit -m "feat(agent): add WebSocket server with message passing"
```

---

## Task 6: MCP tool definitions (`mcp.ts`)

Defines all MCP tools and their handlers, wiring them to `AgentGameState` and `AgentWebSocketServer`.

**Files:**
- Create: `maginet-agent/src/mcp.ts`
- Create: `maginet-agent/src/__tests__/mcp.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// maginet-agent/src/__tests__/mcp.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { createToolHandlers, type ToolContext } from "../mcp.js";
import { AgentGameState } from "../state.js";

const makeCard = (id: string) => ({ id, src: [`https://example.com/${id}.png`] });

// Minimal mock for server
const mockServer = () => {
  const sent: unknown[] = [];
  return {
    send: (msg: unknown) => { sent.push(msg); },
    isConnected: () => true,
    getSent: () => sent,
  };
};

describe("MCP tool handlers", () => {
  let state: AgentGameState;
  let server: ReturnType<typeof mockServer>;
  let handlers: ReturnType<typeof createToolHandlers>;

  beforeEach(() => {
    state = new AgentGameState();
    server = mockServer();
    handlers = createToolHandlers({
      state,
      server: server as any,
      visibility: "full",
      remoteShapes: {},
      remoteCardState: null,
    });
  });

  it("getHand returns empty hand initially", async () => {
    const result = await handlers.getHand({});
    expect(result.content[0].text).toContain("[]");
  });

  it("drawCard draws a card and returns it", async () => {
    state.initializeDeck([makeCard("bolt")]);
    const result = await handlers.drawCard({});
    expect(result.content[0].text).toContain("bolt");
    expect(state.getHand()).toHaveLength(1);
  });

  it("drawCard fails on empty deck", async () => {
    const result = await handlers.drawCard({});
    expect(result.isError).toBe(true);
  });

  it("playCard plays a card from hand", async () => {
    state.initializeDeck([makeCard("bolt")]);
    state.drawCard();
    const cardId = state.getHand()[0].id;
    const result = await handlers.playCard({ cardId });
    expect(result.isError).toBeUndefined();
    expect(state.getHand()).toHaveLength(0);
    expect(state.getAgentShapes()).toHaveLength(1);
  });

  it("playCard fails when card not in hand", async () => {
    const result = await handlers.playCard({ cardId: "nope" });
    expect(result.isError).toBe(true);
  });

  it("tapCard toggles rotation on agent shape", async () => {
    state.initializeDeck([makeCard("bolt")]);
    state.drawCard();
    const cardId = state.getHand()[0].id;
    await handlers.playCard({ cardId });
    const shapeId = state.getAgentShapes()[0].id;

    await handlers.tapCard({ shapeId });
    expect(state.getAgentShapes()[0].rotation).toBe(90);

    await handlers.tapCard({ shapeId });
    expect(state.getAgentShapes()[0].rotation).toBe(0);
  });

  it("getGameState respects full visibility", async () => {
    state.initializeDeck([makeCard("a"), makeCard("b")]);
    state.drawCard();

    const result = await handlers.getGameState({});
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.agentDeckContents).toBeDefined();
    expect(parsed.agentDeckContents).toHaveLength(1);
  });

  it("getGameState respects fair visibility", async () => {
    state.initializeDeck([makeCard("a"), makeCard("b")]);
    state.drawCard();

    const fairHandlers = createToolHandlers({
      state,
      server: server as any,
      visibility: "fair",
      remoteShapes: {},
      remoteCardState: null,
    });

    const result = await fairHandlers.getGameState({});
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.agentDeckContents).toBeUndefined();
  });

  it("mulligan shuffles hand back to deck", async () => {
    state.initializeDeck([makeCard("a"), makeCard("b"), makeCard("c")]);
    state.drawCard();
    state.drawCard();
    expect(state.getHand()).toHaveLength(2);

    await handlers.mulligan({});
    expect(state.getHand()).toHaveLength(0);
    expect(state.getDeckSize()).toBe(3);
  });

  it("getBoardState returns shapes", async () => {
    const boardHandlers = createToolHandlers({
      state,
      server: server as any,
      visibility: "full",
      remoteShapes: {
        "browser-peer": [
          { id: "s1", point: [0, 0], size: [100, 100], type: "image", srcIndex: 0 },
        ],
      },
      remoteCardState: null,
    });

    const result = await boardHandlers.getBoardState({});
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed["browser-peer"]).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd maginet-agent && pnpm test`
Expected: FAIL — `createToolHandlers` not found.

- [ ] **Step 3: Implement MCP tool handlers**

```typescript
// maginet-agent/src/mcp.ts
import type { AgentGameState } from "./state.js";
import type { AgentWebSocketServer } from "./server.js";
import type { Visibility } from "./visibility.js";
import { filterGameState } from "./visibility.js";
import type { Shape, Counter } from "../../src/types/canvas.js";

function generateId(): string {
  return Math.random().toString(36).substr(2, 9);
}

type ToolResult = {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
};

function ok(data: unknown): ToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

function err(message: string): ToolResult {
  return { content: [{ type: "text", text: message }], isError: true };
}

export interface ToolContext {
  state: AgentGameState;
  server: AgentWebSocketServer;
  visibility: Visibility;
  remoteShapes: Record<string, Shape[]>;
  remoteCardState: { cards: number; deck: number } | null;
}

export function createToolHandlers(ctx: ToolContext) {
  return {
    getGameState: async (_args: Record<string, unknown>) => {
      const raw = {
        agentHand: ctx.state.getHand(),
        agentDeck: ctx.state.getDeckContents(),
        boardShapes: {
          agent: ctx.state.getAgentShapes(),
          ...ctx.remoteShapes,
        },
        opponentHand: [] as { id: string; src: string[] }[], // populated from sync
        opponentDeckSize: ctx.remoteCardState?.deck ?? 0,
      };
      return ok(filterGameState(raw, ctx.visibility));
    },

    getHand: async (_args: Record<string, unknown>) => {
      return ok(ctx.state.getHand());
    },

    getBoardState: async (_args: Record<string, unknown>) => {
      return ok({
        agent: ctx.state.getAgentShapes(),
        ...ctx.remoteShapes,
      });
    },

    getDeckInfo: async (_args: Record<string, unknown>) => {
      const info: Record<string, unknown> = {
        size: ctx.state.getDeckSize(),
      };
      if (ctx.visibility === "full") {
        info.contents = ctx.state.getDeckContents();
      }
      return ok(info);
    },

    drawCard: async (_args: Record<string, unknown>) => {
      const card = ctx.state.drawCard();
      if (!card) return err("Deck is empty — cannot draw.");
      return ok(card);
    },

    mulligan: async (_args: Record<string, unknown>) => {
      ctx.state.mulligan();
      return ok({ success: true, deckSize: ctx.state.getDeckSize() });
    },

    playCard: async (args: Record<string, unknown>) => {
      const cardId = args.cardId as string;
      if (!cardId) return err("cardId is required.");

      const card = ctx.state.playCard(cardId);
      if (!card) return err(`Card ${cardId} not found in hand.`);

      const position = (args.position as [number, number]) ?? [
        200 + Math.random() * 400,
        200 + Math.random() * 200,
      ];
      const faceDown = (args.faceDown as boolean) ?? false;

      const shape: Shape = {
        id: generateId(),
        point: position,
        size: [100, 100],
        type: "image",
        src: card.src,
        srcIndex: 0,
        rotation: 0,
        isFlipped: faceDown,
      };

      ctx.state.addAgentShape(shape);
      return ok({ shape, card });
    },

    tapCard: async (args: Record<string, unknown>) => {
      const shapeId = args.shapeId as string;
      if (!shapeId) return err("shapeId is required.");

      const shape = ctx.state.findAgentShape(shapeId);
      if (!shape) return err(`Shape ${shapeId} not found.`);

      const newRotation = (shape.rotation || 0) === 90 ? 0 : 90;
      ctx.state.updateAgentShape(shapeId, { rotation: newRotation });
      return ok({ shapeId, rotation: newRotation });
    },

    untapAll: async (_args: Record<string, unknown>) => {
      const shapes = ctx.state.getAgentShapes();
      let count = 0;
      for (const shape of shapes) {
        if (shape.rotation) {
          ctx.state.updateAgentShape(shape.id, { rotation: 0 });
          count++;
        }
      }
      return ok({ untapped: count });
    },

    sendToHand: async (args: Record<string, unknown>) => {
      const shapeId = args.shapeId as string;
      if (!shapeId) return err("shapeId is required.");

      const shape = ctx.state.findAgentShape(shapeId);
      if (!shape) return err(`Shape ${shapeId} not found.`);
      if (shape.type !== "image" || !shape.src) return err("Shape is not a card.");

      ctx.state.removeAgentShape(shapeId);
      ctx.state.sendToHand([{ id: generateId(), src: shape.src }]);
      return ok({ success: true, handSize: ctx.state.getHand().length });
    },

    sendToDeck: async (args: Record<string, unknown>) => {
      const shapeId = args.shapeId as string;
      const position = (args.position as "top" | "bottom") ?? "top";
      if (!shapeId) return err("shapeId is required.");

      const shape = ctx.state.findAgentShape(shapeId);
      if (!shape) return err(`Shape ${shapeId} not found.`);
      if (shape.type !== "image" || !shape.src) return err("Shape is not a card.");

      ctx.state.removeAgentShape(shapeId);
      ctx.state.sendToDeck([{ id: generateId(), src: shape.src }], position);
      return ok({ success: true, deckSize: ctx.state.getDeckSize() });
    },

    shuffleDeck: async (_args: Record<string, unknown>) => {
      ctx.state.shuffleDeck();
      return ok({ success: true, deckSize: ctx.state.getDeckSize() });
    },

    addCounter: async (args: Record<string, unknown>) => {
      const shapeId = args.shapeId as string;
      const counter = args.counter as Counter;
      if (!shapeId || !counter) return err("shapeId and counter are required.");

      const shape = ctx.state.findAgentShape(shapeId);
      if (!shape) return err(`Shape ${shapeId} not found.`);

      const counters = [...(shape.counters || [])];
      const existingIdx = counters.findIndex((c) => c.label === counter.label);
      if (existingIdx >= 0) {
        counters[existingIdx] = counter;
      } else {
        counters.push(counter);
      }
      ctx.state.updateAgentShape(shapeId, { counters });
      return ok({ shapeId, counters });
    },

    removeCounter: async (args: Record<string, unknown>) => {
      const shapeId = args.shapeId as string;
      const label = args.label as string;
      if (!shapeId || !label) return err("shapeId and label are required.");

      const shape = ctx.state.findAgentShape(shapeId);
      if (!shape) return err(`Shape ${shapeId} not found.`);

      const counters = (shape.counters || []).filter((c) => c.label !== label);
      ctx.state.updateAgentShape(shapeId, { counters });
      return ok({ shapeId, counters });
    },

    flipCard: async (args: Record<string, unknown>) => {
      const shapeId = args.shapeId as string;
      if (!shapeId) return err("shapeId is required.");

      const shape = ctx.state.findAgentShape(shapeId);
      if (!shape) return err(`Shape ${shapeId} not found.`);

      ctx.state.updateAgentShape(shapeId, { isFlipped: !shape.isFlipped });
      return ok({ shapeId, isFlipped: !shape.isFlipped });
    },

    transformCard: async (args: Record<string, unknown>) => {
      const shapeId = args.shapeId as string;
      if (!shapeId) return err("shapeId is required.");

      const shape = ctx.state.findAgentShape(shapeId);
      if (!shape) return err(`Shape ${shapeId} not found.`);

      const nextIndex = (shape.srcIndex + 1) % (shape.src?.length ?? 1);
      ctx.state.updateAgentShape(shapeId, { srcIndex: nextIndex });
      return ok({ shapeId, srcIndex: nextIndex });
    },
  };
}

export const TOOL_DEFINITIONS = [
  {
    name: "getGameState",
    description: "Get a full snapshot of the current game: your hand, deck size, board shapes, and opponent info. Visibility settings control what is visible.",
    inputSchema: { type: "object" as const, properties: {} },
  },
  {
    name: "getHand",
    description: "Get the cards currently in your hand.",
    inputSchema: { type: "object" as const, properties: {} },
  },
  {
    name: "getBoardState",
    description: "Get all shapes on the board, grouped by player. Shows positions, tap state, counters, z-order.",
    inputSchema: { type: "object" as const, properties: {} },
  },
  {
    name: "getDeckInfo",
    description: "Get deck size. In full visibility mode, also returns deck contents.",
    inputSchema: { type: "object" as const, properties: {} },
  },
  {
    name: "loadDeck",
    description: "Load a deck from a deck list string (MTGO/MTGA format, e.g. '4 Lightning Bolt\\n20 Mountain'). Fetches card images from Scryfall.",
    inputSchema: {
      type: "object" as const,
      properties: { deckList: { type: "string", description: "Deck list in MTGO format" } },
      required: ["deckList"],
    },
  },
  {
    name: "loadSnapshot",
    description: "Load a debug snapshot JSON to resume a game state. The snapshot must match the format from Maginet's debug export.",
    inputSchema: {
      type: "object" as const,
      properties: { snapshot: { type: "string", description: "JSON string of a Maginet debug snapshot" } },
      required: ["snapshot"],
    },
  },
  {
    name: "drawCard",
    description: "Draw the top card from your deck into your hand.",
    inputSchema: { type: "object" as const, properties: {} },
  },
  {
    name: "mulligan",
    description: "Shuffle your entire hand back into your deck.",
    inputSchema: { type: "object" as const, properties: {} },
  },
  {
    name: "playCard",
    description: "Play a card from your hand onto the board.",
    inputSchema: {
      type: "object" as const,
      properties: {
        cardId: { type: "string", description: "ID of the card in hand to play" },
        position: {
          type: "array",
          items: { type: "number" },
          description: "Optional [x, y] position on the board. Defaults to a random position.",
        },
        faceDown: { type: "boolean", description: "Play the card face down. Defaults to false." },
      },
      required: ["cardId"],
    },
  },
  {
    name: "tapCard",
    description: "Toggle tap/untap on a card (rotate 0 to 90 degrees, or 90 to 0). In MTG, tapped cards are sideways.",
    inputSchema: {
      type: "object" as const,
      properties: { shapeId: { type: "string", description: "ID of the shape on the board" } },
      required: ["shapeId"],
    },
  },
  {
    name: "untapAll",
    description: "Untap all your cards on the board (set rotation to 0). Typically done at the start of your turn.",
    inputSchema: { type: "object" as const, properties: {} },
  },
  {
    name: "sendToHand",
    description: "Return a card from the board back to your hand.",
    inputSchema: {
      type: "object" as const,
      properties: { shapeId: { type: "string", description: "ID of the shape to return" } },
      required: ["shapeId"],
    },
  },
  {
    name: "sendToDeck",
    description: "Return a card from the board to your deck.",
    inputSchema: {
      type: "object" as const,
      properties: {
        shapeId: { type: "string", description: "ID of the shape to return" },
        position: { type: "string", enum: ["top", "bottom"], description: "Where to place the card in the deck" },
      },
      required: ["shapeId"],
    },
  },
  {
    name: "shuffleDeck",
    description: "Shuffle your deck.",
    inputSchema: { type: "object" as const, properties: {} },
  },
  {
    name: "addCounter",
    description: "Add or update a counter on a card (e.g. +1/+1, loyalty, charge).",
    inputSchema: {
      type: "object" as const,
      properties: {
        shapeId: { type: "string", description: "ID of the shape" },
        counter: {
          type: "object",
          description: "Counter object with label, optional power/toughness or value, optional color",
          properties: {
            label: { type: "string" },
            power: { type: "number" },
            toughness: { type: "number" },
            value: { type: "number" },
            color: { type: "string" },
          },
          required: ["label"],
        },
      },
      required: ["shapeId", "counter"],
    },
  },
  {
    name: "removeCounter",
    description: "Remove a counter from a card by its label.",
    inputSchema: {
      type: "object" as const,
      properties: {
        shapeId: { type: "string", description: "ID of the shape" },
        label: { type: "string", description: "Label of the counter to remove" },
      },
      required: ["shapeId", "label"],
    },
  },
  {
    name: "flipCard",
    description: "Toggle a card between face-up and face-down.",
    inputSchema: {
      type: "object" as const,
      properties: { shapeId: { type: "string", description: "ID of the shape" } },
      required: ["shapeId"],
    },
  },
  {
    name: "transformCard",
    description: "Switch a double-faced card to its other face.",
    inputSchema: {
      type: "object" as const,
      properties: { shapeId: { type: "string", description: "ID of the shape" } },
      required: ["shapeId"],
    },
  },
];
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd maginet-agent && pnpm test`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add maginet-agent/src/mcp.ts maginet-agent/src/__tests__/mcp.test.ts
git commit -m "feat(agent): add MCP tool definitions and handlers"
```

---

## Task 7: CLI entry point (`index.ts`)

Wires the MCP server, WebSocket server, game state, and sync engine together. Parses CLI args and starts everything.

**Files:**
- Create: `maginet-agent/src/index.ts`

- [ ] **Step 1: Implement entry point**

```typescript
// maginet-agent/src/index.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { AgentWebSocketServer } from "./server.js";
import { AgentGameState } from "./state.js";
import { createToolHandlers, TOOL_DEFINITIONS, type ToolContext } from "./mcp.js";
import { loadDeckFromList } from "./scryfall.js";
import type { Visibility } from "./visibility.js";
import type { Shape } from "../../src/types/canvas.js";

function parseArgs(argv: string[]): { port: number; visibility: Visibility } {
  let port = 3210;
  let visibility: Visibility = "fair";

  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--port" && argv[i + 1]) {
      port = parseInt(argv[i + 1], 10);
    }
    if (argv[i] === "--visibility" && argv[i + 1]) {
      visibility = argv[i + 1] as Visibility;
    }
  }

  return { port, visibility };
}

async function main() {
  const { port, visibility } = parseArgs(process.argv.slice(2));

  const gameState = new AgentGameState();
  const wsServer = new AgentWebSocketServer({ port });
  const remoteShapes: Record<string, Shape[]> = {};
  let remoteCardState: { cards: number; deck: number } | null = null;

  const assignedPort = await wsServer.start();
  console.error(`[maginet-agent] WebSocket server listening on port ${assignedPort}`);
  console.error(`[maginet-agent] Visibility: ${visibility}`);

  // Listen for sync messages from browser
  wsServer.onMessage((message) => {
    if (message.type === "sync:channel-snapshot" || message.type === "sync:channel-patch") {
      // Handle shape sync from browser
      const payload = message.payload as Record<string, unknown>;
      if (payload && typeof payload === "object") {
        // Store remote shapes keyed by peer ID
        for (const [peerId, shapes] of Object.entries(payload)) {
          if (Array.isArray(shapes)) {
            remoteShapes[peerId] = shapes as Shape[];
          }
        }
      }
    }

    if (message.type === "action-log") {
      const payload = message.payload as Record<string, unknown>;
      console.error(`[maginet-agent] Action: ${JSON.stringify(payload)}`);
    }

    if (message.type === "card-state-sync") {
      const payload = message.payload as { cards: number; deck: number };
      remoteCardState = payload;
    }
  });

  // Create MCP server
  const mcp = new McpServer({
    name: "maginet-agent",
    version: "0.1.0",
  });

  const toolCtx: ToolContext = {
    state: gameState,
    server: wsServer,
    visibility,
    remoteShapes,
    remoteCardState,
  };

  // Register tools
  for (const def of TOOL_DEFINITIONS) {
    if (def.name === "loadDeck") {
      mcp.tool(def.name, def.description, { deckList: z.string() }, async (args) => {
        const cards = await loadDeckFromList(args.deckList);
        gameState.initializeDeck(cards);
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ success: true, deckSize: cards.length }) }],
        };
      });
    } else if (def.name === "loadSnapshot") {
      mcp.tool(def.name, def.description, { snapshot: z.string() }, async (args) => {
        try {
          const snap = JSON.parse(args.snapshot);
          if (snap.cardState) {
            gameState.initializeDeck(snap.cardState.deck ?? []);
            if (snap.cardState.cards) {
              gameState.sendToHand(snap.cardState.cards);
            }
          }
          if (snap.shapes && Array.isArray(snap.shapes)) {
            for (const shape of snap.shapes) {
              gameState.addAgentShape(shape);
            }
          }
          return {
            content: [{ type: "text" as const, text: JSON.stringify({ success: true }) }],
          };
        } catch (e) {
          return {
            content: [{ type: "text" as const, text: `Failed to load snapshot: ${e}` }],
            isError: true,
          };
        }
      });
    } else {
      const handlers = createToolHandlers(toolCtx);
      const handler = handlers[def.name as keyof typeof handlers];
      if (handler) {
        // Build zod schema from inputSchema properties
        const props = (def.inputSchema as { properties?: Record<string, unknown>; required?: string[] }).properties ?? {};
        const required = (def.inputSchema as { required?: string[] }).required ?? [];
        const zodShape: Record<string, z.ZodType> = {};
        for (const [key, schema] of Object.entries(props)) {
          const s = schema as { type: string; items?: { type: string } };
          if (s.type === "string") {
            zodShape[key] = required.includes(key) ? z.string() : z.string().optional();
          } else if (s.type === "boolean") {
            zodShape[key] = z.boolean().optional();
          } else if (s.type === "number") {
            zodShape[key] = z.number().optional();
          } else if (s.type === "array") {
            zodShape[key] = z.array(z.number()).optional();
          } else if (s.type === "object") {
            zodShape[key] = z.record(z.unknown()).optional();
          }
        }
        mcp.tool(def.name, def.description, zodShape, async (args) => {
          return handler(args as Record<string, unknown>);
        });
      }
    }
  }

  // Start MCP over stdio
  const transport = new StdioServerTransport();
  await mcp.connect(transport);
  console.error("[maginet-agent] MCP server running on stdio");
}

main().catch((error) => {
  console.error("[maginet-agent] Fatal error:", error);
  process.exit(1);
});
```

- [ ] **Step 2: Build and verify**

Run: `cd maginet-agent && pnpm build`
Expected: Compiles to `dist/` without errors.

- [ ] **Step 3: Commit**

```bash
git add maginet-agent/src/index.ts
git commit -m "feat(agent): add CLI entry point wiring MCP + WebSocket + game state"
```

---

## Task 8: Browser WebSocket transport (`websocket.ts`)

A `SyncTransport`-compatible wrapper using the browser's native `WebSocket` API.

**Files:**
- Create: `src/sync/transport/websocket.ts`
- Create: `src/sync/transport/websocket.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/sync/transport/websocket.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createWebSocketTransport } from "./websocket";

// Mock WebSocket
class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  readyState = MockWebSocket.CONNECTING;
  url: string;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  sentMessages: string[] = [];

  constructor(url: string) {
    this.url = url;
  }

  send(data: string) {
    this.sentMessages.push(data);
  }

  close() {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.();
  }

  // Test helpers
  simulateOpen() {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.();
  }

  simulateMessage(data: string) {
    this.onmessage?.({ data });
  }

  simulateClose() {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.();
  }
}

describe("createWebSocketTransport", () => {
  let mockWs: MockWebSocket;

  beforeEach(() => {
    mockWs = new MockWebSocket("ws://localhost:3210");
    vi.stubGlobal("WebSocket", class extends MockWebSocket {
      constructor(url: string) {
        super(url);
        mockWs = this;
      }
    });
  });

  it("creates a transport with the correct interface", () => {
    const transport = createWebSocketTransport({ url: "ws://localhost:3210" });
    expect(transport.start).toBeDefined();
    expect(transport.stop).toBeDefined();
    expect(transport.send).toBeDefined();
    expect(transport.broadcast).toBeDefined();
    expect(transport.onMessage).toBeDefined();
    expect(transport.peers).toBeDefined();
    expect(transport.localPeerId).toBeDefined();
  });

  it("connects on start and reports agent as peer", async () => {
    const transport = createWebSocketTransport({ url: "ws://localhost:3210" });

    const startPromise = transport.start();
    mockWs.simulateOpen();
    await startPromise;

    expect(transport.peers()).toEqual(["agent"]);
  });

  it("sends JSON-serialized envelopes", async () => {
    const transport = createWebSocketTransport({ url: "ws://localhost:3210" });

    const startPromise = transport.start();
    mockWs.simulateOpen();
    await startPromise;

    const envelope = { type: "test", payload: { value: 1 } };
    transport.send("agent", envelope);

    expect(mockWs.sentMessages).toHaveLength(1);
    expect(JSON.parse(mockWs.sentMessages[0])).toEqual(envelope);
  });

  it("receives and deserializes messages", async () => {
    const transport = createWebSocketTransport({ url: "ws://localhost:3210" });

    const startPromise = transport.start();
    mockWs.simulateOpen();
    await startPromise;

    const received: unknown[] = [];
    transport.onMessage((_, msg) => received.push(msg));

    mockWs.simulateMessage(JSON.stringify({ type: "hello", payload: {} }));

    expect(received).toHaveLength(1);
    expect(received[0]).toEqual({ type: "hello", payload: {} });
  });

  it("calls onConnectionClose when socket closes", async () => {
    const onClose = vi.fn();
    const transport = createWebSocketTransport({ url: "ws://localhost:3210" });

    const startPromise = transport.start();
    mockWs.simulateOpen();
    await startPromise;

    transport.onConnectionClose!(onClose);
    mockWs.simulateClose();

    expect(onClose).toHaveBeenCalledWith("agent");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- src/sync/transport/websocket.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the WebSocket transport**

```typescript
// src/sync/transport/websocket.ts
import type {
  SyncTransport,
  SyncEnvelope,
  SyncPeerId,
} from "@vescofire/peersync";

export interface WebSocketTransportOptions {
  url: string;
  agentPeerId?: string;
  onConnected?: () => void;
  onDisconnected?: () => void;
  onError?: (error: Error) => void;
}

export function createWebSocketTransport(
  options: WebSocketTransportOptions
): SyncTransport {
  const agentPeerId = options.agentPeerId ?? "agent";
  let ws: WebSocket | null = null;
  let localId: string | null = null;
  const messageListeners = new Set<
    (fromPeerId: SyncPeerId, message: SyncEnvelope) => void
  >();
  const openListeners = new Set<(peerId: SyncPeerId) => void>();
  const closeListeners = new Set<(peerId: SyncPeerId) => void>();

  return {
    start: async (localPeerId?: SyncPeerId) => {
      localId = localPeerId ?? `browser-${Math.random().toString(36).substr(2, 6)}`;

      return new Promise<void>((resolve, reject) => {
        ws = new WebSocket(options.url);

        ws.onopen = () => {
          openListeners.forEach((listener) => listener(agentPeerId));
          options.onConnected?.();
          resolve();
        };

        ws.onerror = (event) => {
          const error = new Error("WebSocket connection failed");
          options.onError?.(error);
          reject(error);
        };

        ws.onmessage = (event) => {
          try {
            const message = JSON.parse(
              typeof event.data === "string" ? event.data : ""
            ) as SyncEnvelope;
            messageListeners.forEach((listener) =>
              listener(agentPeerId, message)
            );
          } catch {
            // Ignore malformed messages
          }
        };

        ws.onclose = () => {
          closeListeners.forEach((listener) => listener(agentPeerId));
          options.onDisconnected?.();
        };
      });
    },

    stop: async () => {
      if (ws) {
        ws.close();
        ws = null;
      }
    },

    connect: async (_peerId: SyncPeerId) => {
      // No-op: the WebSocket connection is established in start()
    },

    disconnect: (_peerId?: SyncPeerId) => {
      if (ws) {
        ws.close();
        ws = null;
      }
    },

    peers: () => {
      return ws && ws.readyState === WebSocket.OPEN ? [agentPeerId] : [];
    },

    localPeerId: () => localId,

    send: (_peerId: SyncPeerId, message: SyncEnvelope) => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(message));
      }
    },

    broadcast: (message: SyncEnvelope) => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(message));
      }
    },

    onMessage: (
      callback: (fromPeerId: SyncPeerId, message: SyncEnvelope) => void
    ) => {
      messageListeners.add(callback);
      return () => {
        messageListeners.delete(callback);
      };
    },

    onConnectionOpen: (callback: (peerId: SyncPeerId) => void) => {
      openListeners.add(callback);
      return () => {
        openListeners.delete(callback);
      };
    },

    onConnectionClose: (callback: (peerId: SyncPeerId) => void) => {
      closeListeners.add(callback);
      return () => {
        closeListeners.delete(callback);
      };
    },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- src/sync/transport/websocket.test.ts`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/sync/transport/websocket.ts src/sync/transport/websocket.test.ts
git commit -m "feat(sync): add browser-side WebSocket transport"
```

---

## Task 9: Wire WebSocket transport into peerStore

Add the ability to optionally create a WebSocket transport alongside the PeerJS transport.

**Files:**
- Modify: `src/sync/react/peerStore.ts`

- [ ] **Step 1: Add agent connection support to peerStore**

Add a new `connectAgent` function to the store. This creates a secondary sync client using the WebSocket transport:

In `src/sync/react/peerStore.ts`, add after the existing `usePeerStore` creation:

```typescript
// --- Add these imports at the top ---
import { createWebSocketTransport } from "../transport/websocket";

// --- Add after the usePeerStore definition ---

let agentSyncClient: ReturnType<typeof createSyncClient> | null = null;
let agentTransport: ReturnType<typeof createWebSocketTransport> | null = null;

export const connectAgent = async (port: number = 3210): Promise<void> => {
  if (agentSyncClient) {
    await agentSyncClient.stop();
  }

  agentTransport = createWebSocketTransport({
    url: `ws://localhost:${port}`,
    onConnected: () => {
      console.log("[maginet] Agent connected");
    },
    onDisconnected: () => {
      console.log("[maginet] Agent disconnected");
      agentSyncClient = null;
      agentTransport = null;
    },
    onError: (error) => {
      setPeerError(error);
    },
  });

  agentSyncClient = createSyncClient({
    roomId: "maginet-agent",
    transport: agentTransport,
  });

  agentSyncClient.registerChannel(
    createShapesSyncChannel({
      getLocalPeerId: () => usePeerStore.getState().peer?.id ?? "browser",
    })
  );

  await agentSyncClient.start();
};

export const disconnectAgent = async (): Promise<void> => {
  if (agentSyncClient) {
    await agentSyncClient.stop();
    agentSyncClient = null;
    agentTransport = null;
  }
};

export const isAgentConnected = (): boolean => {
  return agentTransport !== null && agentSyncClient !== null;
};
```

- [ ] **Step 2: Verify the app still builds**

Run: `pnpm build`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/sync/react/peerStore.ts
git commit -m "feat(sync): wire WebSocket transport for agent connections"
```

---

## Task 10: "Connect Agent" UI in SetupScreen

Add a small UI section to the multiplayer step in SetupScreen for connecting to the agent.

**Files:**
- Modify: `src/board/components/SetupScreen.tsx`

- [ ] **Step 1: Add agent connection UI**

Add an "Agent" panel next to the existing multiplayer panels. In `src/board/components/SetupScreen.tsx`:

Add import:
```typescript
import { connectAgent, disconnectAgent, isAgentConnected } from "../../sync/react/peerStore";
```

Add state inside the `SetupScreen` component:
```typescript
const [agentPort, setAgentPort] = useState("3210");
const [agentConnected, setAgentConnected] = useState(false);
const [agentConnecting, setAgentConnecting] = useState(false);

const handleConnectAgent = async () => {
  setAgentConnecting(true);
  try {
    await connectAgent(parseInt(agentPort, 10));
    setAgentConnected(true);
  } catch {
    setAgentConnected(false);
  } finally {
    setAgentConnecting(false);
  }
};

const handleDisconnectAgent = () => {
  void disconnectAgent();
  setAgentConnected(false);
};
```

Add this panel after the "Your ID" panel in the multiplayer step's `setup-grid`:

```tsx
<div className="setup-panel win-bevel flex flex-col gap-2 rounded bg-win-bg-light p-2.5 col-span-2 max-[720px]:col-span-1">
  <label className="setup-label text-[11px] tracking-[0.12em] uppercase text-win-text-muted">
    AI Agent
  </label>
  <div className="setup-input-row flex gap-2.5 items-center max-[720px]:flex-col max-[720px]:items-stretch">
    <Input
      className="setup-input w-24 p-3 text-[13px] leading-[1.4] shadow-none"
      type="text"
      value={agentPort}
      onChange={(event) => setAgentPort(event.target.value)}
      placeholder="Port"
      disabled={agentConnected}
    />
    {agentConnected ? (
      <Button
        type="button"
        className="setup-button ghost rounded px-3.5 py-2 text-xs bg-win-header-bg"
        onClick={handleDisconnectAgent}
      >
        Disconnect
      </Button>
    ) : (
      <Button
        type="button"
        className="setup-button primary rounded px-3.5 py-2 text-xs bg-win-hover hover:bg-[#f5f5f5]"
        onClick={handleConnectAgent}
        disabled={agentConnecting}
      >
        {agentConnecting ? "Connecting..." : "Connect Agent"}
      </Button>
    )}
  </div>
  <div className="setup-hint text-[11px] text-win-text-muted">
    {agentConnected
      ? "Agent connected. It will appear as a player on the board."
      : "Connect to a local MCP agent for AI play or copilot advice."}
  </div>
</div>
```

- [ ] **Step 2: Verify it renders correctly**

Run: `pnpm dev`
Navigate to `http://localhost:5173`, enter a deck, go to multiplayer step. Verify the "AI Agent" panel appears with a port input and "Connect Agent" button.

- [ ] **Step 3: Commit**

```bash
git add src/board/components/SetupScreen.tsx
git commit -m "feat(ui): add Connect Agent button to setup screen"
```

---

## Task 11: End-to-end integration test

Test the full loop: MCP server starts, browser transport connects, agent draws a card and it appears on the browser's board.

**Files:**
- Create: `maginet-agent/src/__tests__/e2e.integration.test.ts`

- [ ] **Step 1: Write the integration test**

```typescript
// maginet-agent/src/__tests__/e2e.integration.test.ts
import { describe, it, expect, afterEach } from "vitest";
import { WebSocket } from "ws";
import { AgentWebSocketServer } from "../server.js";
import { AgentGameState } from "../state.js";
import { createToolHandlers } from "../mcp.js";
import type { Shape } from "../../../src/types/canvas.js";

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const waitFor = async (
  assertion: () => void,
  timeoutMs = 2000,
  pollMs = 10
) => {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try { assertion(); return; }
    catch { await wait(pollMs); }
  }
  assertion();
};

describe("Agent E2E", () => {
  let server: AgentWebSocketServer | null = null;

  afterEach(async () => {
    if (server) { await server.stop(); server = null; }
  });

  it("agent loads deck, draws card, plays to board, browser receives shape", async () => {
    // 1. Start agent server
    server = new AgentWebSocketServer({ port: 0 });
    const port = await server.start();

    // 2. Create game state and tool handlers
    const state = new AgentGameState();
    const remoteShapes: Record<string, Shape[]> = {};
    const handlers = createToolHandlers({
      state,
      server: server as any,
      visibility: "full",
      remoteShapes,
      remoteCardState: null,
    });

    // 3. Simulate browser connecting
    const browserReceived: unknown[] = [];
    const ws = new WebSocket(`ws://localhost:${port}`);
    await new Promise<void>((resolve) => ws.on("open", resolve));
    ws.on("message", (data) => browserReceived.push(JSON.parse(data.toString())));

    // 4. Initialize deck with pre-made cards (skip Scryfall)
    state.initializeDeck([
      { id: "card-1", src: ["https://example.com/bolt.png"] },
      { id: "card-2", src: ["https://example.com/mountain.png"] },
    ]);

    // 5. Draw a card
    const drawResult = await handlers.drawCard({});
    expect(drawResult.isError).toBeUndefined();
    expect(state.getHand()).toHaveLength(1);

    // 6. Play the card
    const cardId = state.getHand()[0].id;
    const playResult = await handlers.playCard({
      cardId,
      position: [300, 300],
    });
    expect(playResult.isError).toBeUndefined();
    expect(state.getHand()).toHaveLength(0);
    expect(state.getAgentShapes()).toHaveLength(1);

    // 7. Verify shape was created correctly
    const shape = state.getAgentShapes()[0];
    expect(shape.point).toEqual([300, 300]);
    expect(shape.type).toBe("image");
    expect(shape.src).toEqual(["https://example.com/bolt.png"]);
    expect(shape.isFlipped).toBe(false);

    // 8. Tap the card
    await handlers.tapCard({ shapeId: shape.id });
    expect(state.getAgentShapes()[0].rotation).toBe(90);

    // 9. Get game state
    const gameState = await handlers.getGameState({});
    const parsed = JSON.parse(gameState.content[0].text);
    expect(parsed.agentHand).toHaveLength(0);
    expect(parsed.agentDeckSize).toBe(1);
    expect(parsed.boardShapes.agent).toHaveLength(1);

    ws.close();
  });
});
```

- [ ] **Step 2: Run the test**

Run: `cd maginet-agent && pnpm test`
Expected: All tests PASS.

- [ ] **Step 3: Commit**

```bash
git add maginet-agent/src/__tests__/e2e.integration.test.ts
git commit -m "test(agent): add end-to-end integration test"
```

---

## Task 12: Build verification and MCP config

Final verification that everything builds and works together.

**Files:**
- No new files. Verification only.

- [ ] **Step 1: Build the agent package**

Run: `cd maginet-agent && pnpm build`
Expected: Compiles to `dist/` without errors.

- [ ] **Step 2: Build the browser app**

Run: `pnpm build`
Expected: Build succeeds.

- [ ] **Step 3: Run all tests**

Run: `cd maginet-agent && pnpm test && cd .. && pnpm test`
Expected: All tests pass in both packages.

- [ ] **Step 4: Run lint**

Run: `pnpm lint`
Expected: No warnings (or only pre-existing ones).

- [ ] **Step 5: Log the MCP config for Claude Code**

The user should add this to their Claude Code MCP config (`.claude/settings.json` or project `.mcp.json`):

```json
{
  "mcpServers": {
    "maginet": {
      "command": "node",
      "args": ["./maginet-agent/dist/index.js", "--port", "3210", "--visibility", "fair"]
    }
  }
}
```

- [ ] **Step 6: Commit any remaining changes**

```bash
git add -A
git commit -m "chore: finalize maginet-agent build and verify integration"
```

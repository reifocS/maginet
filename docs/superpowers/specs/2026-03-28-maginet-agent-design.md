# Maginet Agent — Design Spec

## Overview

An MCP server that lets Claude Code play Magic: The Gathering on a live Maginet board. The agent connects to the browser via WebSocket, syncs state through the existing transport-agnostic sync engine, and exposes game actions as MCP tools.

Two modes:
- **Opponent mode** — Agent has its own deck/hand and plays as a separate peer against the human.
- **Copilot mode** — Agent observes the human's game state (read-only) and gives advice when asked.

Both modes run from the same MCP server. In opponent mode, the human can also ask for copilot-style advice since the agent has access to observation tools alongside action tools.

## Architecture

```
┌─────────────────┐         stdio          ┌──────────────────────┐
│   Claude Code   │◄──────────────────────►│   MCP Server (Node)  │
│   (LLM agent)   │     MCP protocol       │                      │
└─────────────────┘                        │  - Game state (own)  │
                                           │  - Tool handlers     │
                                           │  - Visibility filter │
                                           │  - WS server :PORT   │
                                           └──────────┬───────────┘
                                                      │ WebSocket
                                                      │
                                           ┌──────────▼───────────┐
                                           │   Maginet (Browser)  │
                                           │                      │
                                           │  - WS Transport      │
                                           │    (new, alongside   │
                                           │     PeerJS)          │
                                           │  - Sync channels     │
                                           │  - Normal UI         │
                                           └──────────────────────┘
```

Three components:
1. **MCP Server** — Node.js process spawned by Claude Code via stdio. Runs a WebSocket server on a local port. In opponent mode, holds the agent's own card state using the shared `cardReducer` logic.
2. **WebSocket Transport** — New `SyncTransport` implementation in the browser. Connects to `ws://localhost:PORT`. Plugs into the existing sync channel system — shapes and card actions flow through the same diff/patch/snapshot model.
3. **Claude Code** — Calls MCP tools. Decision-making comes from the LLM's natural MTG knowledge.

## User Flow

### Playing against the agent (opponent mode)

1. Configure the MCP server in Claude Code settings (one-time setup).
2. Open Maginet in the browser (local or deployed). Load your deck normally.
3. Click "Connect Agent" on the setup screen. Browser connects to `ws://localhost:3210`.
4. Tell Claude: "Load this deck: 4 Lightning Bolt, 20 Mountain... and play a game against me."
5. Claude draws its opening hand, you draw yours. You take turns. Claude's moves appear live on your canvas.
6. Ask Claude "What should I play?" at any time for advice (opponent mode includes observation tools).

### Using copilot mode

1. Same setup — open Maginet, connect agent.
2. Play your game normally (against a human via PeerJS, or solo).
3. Ask Claude: "What's my best play here?" — it reads your hand, the board, and advises.

## MCP Tool Surface

### Observation Tools (both modes)

| Tool | Parameters | Returns |
|------|-----------|---------|
| `getGameState` | none | Full snapshot: board shapes, hand, deck size, opponent visible cards, opponent hand count |
| `getHand` | none | Array of cards in hand (name, image URLs, card ID) |
| `getBoardState` | none | All shapes on canvas: positions, tap state, counters, z-order, isFlipped |
| `getDeckInfo` | none | Deck size. In `full` visibility: deck order and card contents |

### Action Tools (opponent mode only)

| Tool | Parameters | Description |
|------|-----------|-------------|
| `loadDeck` | `deckList: string` | Import deck list (MTGO format), fetch from Scryfall, initialize deck |
| `loadSnapshot` | `snapshot: string` | Load a debug snapshot JSON to resume a game state |
| `drawCard` | none | Draw top card from deck to hand |
| `mulligan` | none | Shuffle hand back into deck |
| `playCard` | `cardId: string, position?: [x, y], faceDown?: boolean` | Play a card from hand onto the board |
| `tapCard` | `shapeId: string` | Toggle tap/untap (0 deg / 90 deg rotation) |
| `untapAll` | none | Untap all agent's cards on the board |
| `sendToHand` | `shapeId: string` | Return a board card to hand |
| `sendToDeck` | `shapeId: string, position: "top" \| "bottom"` | Return a board card to deck |
| `shuffleDeck` | none | Shuffle the deck |
| `addCounter` | `shapeId: string, counter: Counter` | Add or modify a counter on a card |
| `removeCounter` | `shapeId: string, label: string` | Remove a counter by label |
| `flipCard` | `shapeId: string` | Toggle face-down/face-up |
| `transformCard` | `shapeId: string` | Switch to next card face (double-faced cards) |

## Visibility

Controlled by `--visibility` CLI flag.

### `fair` (default)
- Agent's own hand: visible.
- Agent's deck: size only, no peeking at order/contents.
- Opponent's hand: count only, no contents.
- Board: fully visible (public information).

### `full`
- Everything visible: deck order, opponent hand contents.
- Useful for debugging, testing, and copilot advice on your own hand.

In copilot mode, `full` visibility is the natural choice — the agent needs to see your hand to advise you.

## WebSocket Transport (Browser Side)

New file: `src/sync/transport/websocket.ts`

Implements the existing `SyncTransport` interface:
- `connect()` — Opens WebSocket to `ws://localhost:PORT`
- `send(envelope)` — Serializes `SyncEnvelope` as JSON, sends over WS
- `onMessage(callback)` — Deserializes incoming JSON into `SyncEnvelope`
- `disconnect()` — Closes WebSocket

Message format: same `SyncEnvelope<TType, TPayload>` wire format used by PeerJS transport, serialized as JSON. No new protocol.

The sync client handles snapshots on connect and patches on changes — same behavior as PeerJS peers.

## State Sync

### Browser to Agent
The browser pushes state through the WebSocket sync channel:
- Shape diffs (cards played, tapped, moved, removed)
- Card action broadcasts (draw, mulligan — with `actionId` for ordering)

The MCP server maintains a local mirror of the board state, updated via the existing `diff/apply/snapshot` model.

### Agent to Browser (opponent mode)
When the agent takes an action (e.g. `playCard`):
1. Updates local card state (deck/hand via `cardReducer`)
2. Creates the shape, adds to local shape list
3. Broadcasts diff through WebSocket sync channel
4. Browser receives patch, renders the new card on canvas

### Agent to Browser (copilot mode)
Read-only. Agent never broadcasts state changes. Only receives updates.

### State ownership

| State | Opponent mode | Copilot mode |
|-------|--------------|--------------|
| Agent's deck/hand | MCP server | N/A (reads browser state) |
| Board shapes | Shared (sync) | Browser (agent reads) |
| Human's deck/hand | Browser | Browser (agent reads) |

## Connection Lifecycle

### Startup
1. Claude Code spawns: `maginet-agent --port 3210 --visibility fair`
2. MCP server starts WebSocket server on specified port
3. All tools (observation + action) are always registered. Mode is implicit: calling `loadDeck` puts the agent in opponent mode (it now has its own state). Without loading a deck, the agent is effectively a copilot (observation-only).
4. Server waits for browser connection

### Browser connection
1. User clicks "Connect Agent" or navigates with `?agent=PORT`
2. Browser opens `ws://localhost:PORT`
3. WebSocket transport registers with sync client
4. Sync client sends full snapshot (existing behavior for new peers)
5. UI shows "Agent connected" indicator

### Disconnection
- Browser shows "Agent disconnected" on WebSocket drop
- Auto-reconnect with backoff
- MCP server preserves state (opponent mode) so game resumes on reconnect

### Coexistence with PeerJS
Both transports run simultaneously. The sync client already supports multiple peers. Valid configurations:
- You + Agent (opponent) — play against AI
- You + Human (PeerJS) + Agent (copilot) — play human with AI advice
- You + Agent (opponent) — play AI and ask for advice too

## Project Structure

```
src/
├── sync/
│   └── transport/
│       ├── peerjs.ts              # Existing — unchanged
│       └── websocket.ts           # NEW — WebSocketTransport
├── board/
│   └── components/
│       └── SetupScreen.tsx        # Modified — "Connect Agent" UI
│
maginet-agent/                     # NEW — standalone Node.js package
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts                   # CLI entry — parses args, starts WS + MCP
│   ├── server.ts                  # WebSocket server + sync handling
│   ├── mcp.ts                     # MCP tool definitions + handlers
│   ├── state.ts                   # Agent card state (reuses cardReducer)
│   └── visibility.ts              # Fair/full state filtering
```

- `maginet-agent/` is a monorepo sibling that imports shared code from `src/` (cardReducer, SyncEnvelope, types, SyncChannelPlugin interface).
- Browser changes are minimal: one new transport file + small UI addition.

### Claude Code MCP config

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

## Out of Scope

- Built-in strategy engine — the LLM handles all decision-making.
- Turn/phase enforcement — the agent follows MTG rules via LLM knowledge, not programmatic validation.
- Opponent hand tracking or hidden information inference.
- Graveyard/exile zones — not yet modeled in Maginet.
- Life total management — currently manual text shapes in the app.

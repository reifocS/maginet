# Agent Relay Mode — Design Spec

## Overview

Refactor the agent connection from a dual sync client model to a relay model. The browser that hosts the WebSocket connection to the MCP agent acts as a dumb relay — it bridges messages between the agent (WS) and other players (PeerJS). The agent plays under the relay's peer identity, so remote players see a normal PeerJS peer.

This replaces the current approach where the agent has its own separate sync client and shapes channel.

## Topology

```
Agent (MCP/WS) ←——→ Relay Browser ←—PeerJS—→ Player B
                                    ←—PeerJS—→ Player C
                                    ←—PeerJS—→ ...
```

- **Relay browser** hosts the WS server connection. Does not play — it bridges.
- **Agent** holds its own deck/hand/shapes. Its actions appear under the relay's peer ID.
- **Other players** connect via PeerJS. They see the relay as a normal player. They don't know it's AI-controlled.

### Solo vs Agent

Open two tabs:
- Tab 1: relay (hosts WS, bridges traffic)
- Tab 2: you as a player (connects to Tab 1 via PeerJS)

### Agent vs Remote Human

- You: relay browser (hosts WS)
- Opponent: connects to you via PeerJS, plays normally

## Data Flow

### Agent → Players (agent plays a card)

1. Agent calls `playCard` MCP tool
2. MCP server updates agent's local state, creates shape
3. MCP server sends shape update over WS to relay browser
4. Relay browser receives shape, adds it to its own local shapes (owned by relay's peer ID)
5. Sync engine broadcasts the shape to all PeerJS peers as the relay's shapes
6. Other players see a new card appear — attributed to the relay peer

### Players → Agent (opponent plays a card)

1. Player B plays a card in their browser
2. PeerJS sync broadcasts shape patch to relay browser
3. Relay browser receives remote shapes via `setRemoteShapes` callback
4. Relay browser forwards the remote shapes to agent via WS message
5. Agent receives opponent state update, updates `remoteShapes`

### Agent observes game state

The agent sees:
- Its own hand/deck (managed locally in MCP server)
- Its own shapes on the board (managed locally, relayed through relay browser)
- All remote players' shapes (forwarded from relay browser)
- Action log entries (forwarded from relay browser)
- Card state sync from players (hand count, deck count — forwarded from relay browser)

## Browser Changes

### Remove

- `src/sync/transport/websocket.ts` — no longer needed
- `src/sync/transport/websocket.test.ts` — no longer needed
- `connectAgent` / `disconnectAgent` / `isAgentConnected` / `sendAgentMessage` in peerStore — replaced by relay logic
- The separate `agentSyncClient` and `agentTransport` — no second sync client

### Add / Modify

**`src/sync/react/agentRelay.ts`** (new) — The relay module:
- Opens a WebSocket to the agent (`ws://localhost:PORT`)
- Listens for shape updates from the agent → applies them to the relay browser's local shapes via `useShapeStore`
- Listens for remote shapes arriving via PeerJS (from `peerSyncState.receivedDataMap`) → forwards them to the agent via WS
- Forwards action-log, heartbeat, card-state-sync, random-event messages bidirectionally
- Exposes `startRelay(port)` and `stopRelay()`

**`src/sync/react/peerStore.ts`** — Remove agent-specific code (connectAgent, disconnectAgent, agentSyncClient, agentTransport, connectedAgentPeerIds). Simplify `sendMessage` back to just `syncClient.send`.

**`src/sync/react/usePeerSync.ts`** — Remove `connectedAgentPeerIds` usage. Revert `selectConnectedPeerSyncUiState` to original form.

**`src/board/SelectionPanel.tsx`** — Change "Agent" button to start/stop relay mode instead of connecting a separate sync client.

**`src/board/components/SetupScreen.tsx`** — Same: "Connect Agent" starts relay.

## Agent (MCP Server) Changes

### Minimal

The MCP server (`maginet-agent/`) stays mostly the same:
- Still holds its own deck/hand/shapes
- Still has `AgentWebSocketServer` for the WS connection
- Still broadcasts shape snapshots over WS when shapes change
- Still receives remote shape data and action logs via WS

The only change: the messages it receives from the relay browser now include all players' shapes (not just the hosting browser's shapes), and its outgoing shapes will appear under the relay's peer ID.

### Message Protocol

Same WS message format. The relay browser and agent exchange:

**Relay → Agent:**
- `{ type: "sync:remote-shapes", payload: { [peerId]: Shape[] } }` — all remote players' shapes
- `{ type: "action-log", payload: ActionLogEntry }` — forwarded from any player
- `{ type: "card-state-sync", payload: { cards, deck, hand } }` — forwarded from any player
- `{ type: "random-event", payload: ... }` — forwarded

**Agent → Relay:**
- `{ type: "sync:agent-shapes", payload: Shape[] }` — agent's current shapes
- `{ type: "action-log", payload: ActionLogEntry }` — agent's actions

## Relay Lifecycle

1. User clicks "Start Relay" (or "Connect Agent")
2. Browser opens WS to `ws://localhost:PORT`
3. On connect: browser sends current remote shapes snapshot to agent
4. Relay is active — bidirectional forwarding starts
5. User clicks "Stop Relay" (or "Disconnect")
6. WS closed, relay state cleaned up

## What Gets Simpler

- **One sync client** — no more parallel `agentSyncClient`
- **No custom transport** — `websocket.ts` deleted
- **No message forwarding hacks** — `sendMessage` doesn't need to route to two clients
- **No `connectedAgentPeerIds`** — agent isn't a peer in the PeerJS sense
- **Agent invisible to PeerJS** — no weird dual-peer-ID issues

## What Gets Different

- **Relay browser can't play** — it's a bridge. Open a second tab to play against the agent.
- **Shapes attribution** — agent's shapes appear under relay's peer ID, not under "agent"
- **Single point of failure** — if relay browser closes, agent loses connection to all players

## Out of Scope

- Auto-reconnect on relay disconnect
- Multiple agents
- Agent directly connecting to PeerJS (requires native WebRTC in Node)

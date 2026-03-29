// WebRTC polyfill — MUST be first, before any PeerJS imports
import polyfill from "node-datachannel/polyfill";
Object.assign(globalThis, polyfill);

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { createAgentPeer } from "./peer.js";
import { AgentGameState, type Shape } from "./state.js";
import { createToolHandlers, TOOL_DEFINITIONS } from "./mcp.js";
import { loadDeckFromList, fetchCardMetaByImageUrl } from "./scryfall.js";
import type { Visibility } from "./visibility.js";

function parseArgs(argv: string[]): { peer: string | null; visibility: Visibility } {
  let peer: string | null = null;
  let visibility: Visibility = "fair";

  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--peer" && argv[i + 1]) {
      peer = argv[i + 1];
    }
    if (argv[i] === "--visibility" && argv[i + 1]) {
      const v = argv[i + 1];
      if (v !== "fair" && v !== "full") {
        throw new Error(`--visibility must be "fair" or "full", got "${v}"`);
      }
      visibility = v;
    }
  }

  return { peer, visibility };
}

async function main() {
  const { peer: initialPeer, visibility } = parseArgs(process.argv.slice(2));

  const gameState = new AgentGameState();
  const remoteShapes: Record<string, Shape[]> = {};
  let remoteCardState: { cards: number; deck: number; hand: Array<{ id: string; src: string[] }> } | null = null;
  const MAX_ACTION_LOG = 200;
  const actionLog: Array<{ timestamp: number; action: string; playerId?: string; playerName?: string; cardsInHand?: number; cardNames?: string[] }> = [];
  const pushActionLog = (entry: (typeof actionLog)[number]) => {
    actionLog.push(entry);
    if (actionLog.length > MAX_ACTION_LOG) actionLog.splice(0, actionLog.length - MAX_ACTION_LOG);
  };

  // Auto-fetch Scryfall metadata for unknown card images
  const pendingLookups = new Set<string>();
  const resolveUnknownCards = (shapes: Shape[]) => {
    for (const shape of shapes) {
      if (shape.type !== "image" || !shape.src?.length) continue;
      const url = shape.src[0];
      if (gameState.lookupCardMeta(url) || pendingLookups.has(url)) continue;
      pendingLookups.add(url);
      fetchCardMetaByImageUrl(url).then((result) => {
        pendingLookups.delete(url);
        if (result) {
          gameState.registerCardMeta(result.imageUrl, result.meta);
          console.error(`[maginet-agent] Resolved: ${result.meta.name}`);
        }
      }).catch(() => { pendingLookups.delete(url); });
    }
  };

  // Create PeerJS-based agent peer
  const agentPeer = await createAgentPeer({
    getLocalShapes: () => gameState.getAgentShapes(),
    subscribeLocalShapes: (cb) => gameState.subscribeShapes(cb),
    onRemoteShapes: (peerId, shapes) => {
      remoteShapes[peerId] = shapes;
      resolveUnknownCards(shapes);
    },
    onPeerReady: (peerId) => {
      console.error(`[maginet-agent] Agent peer ID: ${peerId}`);
      console.error(`[maginet-agent] Visibility: ${visibility}`);
    },
    onError: (error) => {
      console.error(`[maginet-agent] Peer error: ${error.message}`);
    },
  });

  // Listen for game messages via PeerJS sync client
  agentPeer.onMessage("action-log", (msg) => {
    const payload = msg.payload as { action?: string; playerId?: string; playerName?: string; cardsInHand?: number; timestamp?: number; cardSrcs?: string[][] };
    const cardNames = payload.cardSrcs?.map((srcs) => {
      const meta = gameState.lookupCardMeta(srcs[0]);
      return meta?.name ?? srcs[0];
    });
    pushActionLog({
      timestamp: payload.timestamp ?? Date.now(),
      action: payload.action ?? "unknown",
      playerId: payload.playerId,
      playerName: payload.playerName,
      cardsInHand: payload.cardsInHand,
      cardNames,
    });
    const nameStr = cardNames?.length ? ` (${cardNames.join(", ")})` : "";
    console.error(`[maginet-agent] Action: ${payload.playerName ?? payload.playerId}: ${payload.action}${nameStr}`);
  });

  agentPeer.onMessage("action-log-snapshot", (msg) => {
    const payload = msg.payload as { entries?: Array<{ action?: string; playerId?: string; playerName?: string; cardsInHand?: number; timestamp?: number }> };
    if (payload.entries) {
      for (const entry of payload.entries) {
        pushActionLog({
          timestamp: entry.timestamp ?? Date.now(),
          action: entry.action ?? "unknown",
          playerId: entry.playerId,
          playerName: entry.playerName,
          cardsInHand: entry.cardsInHand,
        });
      }
    }
  });

  agentPeer.onMessage("card-state-sync", (msg) => {
    const payload = msg.payload as { cards: number; deck: number; hand?: Array<{ id: string; src: string[] }> };
    remoteCardState = { cards: payload.cards, deck: payload.deck, hand: payload.hand ?? [] };
  });

  // Start PeerJS peer
  await agentPeer.start();

  // Auto-connect to a browser peer if --peer was given
  if (initialPeer) {
    console.error(`[maginet-agent] Auto-connecting to peer: ${initialPeer}`);
    agentPeer.connect(initialPeer).catch((e: unknown) => {
      console.error(`[maginet-agent] Auto-connect failed: ${e}`);
    });
  }

  // Create MCP server
  const mcp = new McpServer({
    name: "maginet-agent",
    version: "0.1.0",
  });

  // Mutable context — handlers read current values of remoteShapes/remoteCardState
  const toolCtx = {
    state: gameState,
    server: agentPeer,
    visibility,
    remoteShapes,
    actionLog,
    get remoteCardState() {
      return remoteCardState;
    },
  };

  const handlers = createToolHandlers(toolCtx);

  // connectToPeer tool — lets the agent connect to a browser
  mcp.tool(
    "connectToPeer",
    "Connect to a Maginet browser by its peer ID.",
    { peerId: z.string().describe("The PeerJS peer ID shown in the browser") },
    async (args) => {
      try {
        await agentPeer.connect(args.peerId);
        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({ success: true, connectedTo: args.peerId, agentPeerId: agentPeer.localPeerId() }),
          }],
        };
      } catch (e) {
        return {
          content: [{ type: "text" as const, text: `Failed to connect: ${e}` }],
          isError: true,
        };
      }
    }
  );

  // Register loadDeck separately (async Scryfall fetch)
  mcp.tool(
    "loadDeck",
    "Load a deck from a deck list string (MTGO format). Fetches card images from Scryfall.",
    { deckList: z.string().describe("Deck list in MTGO format, e.g. '4 Lightning Bolt'") },
    async (args) => {
      try {
        const cards = await loadDeckFromList(args.deckList);
        gameState.initializeDeck(cards);
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ success: true, deckSize: cards.length }) }],
        };
      } catch (e) {
        return {
          content: [{ type: "text" as const, text: `Failed to load deck: ${e}` }],
          isError: true,
        };
      }
    }
  );

  // Register loadSnapshot
  mcp.tool(
    "loadSnapshot",
    "Load a debug snapshot JSON to resume a game state.",
    { snapshot: z.string().describe("JSON string of a Maginet debug snapshot") },
    async (args) => {
      try {
        const snap = JSON.parse(args.snapshot) as {
          cardState?: { deck?: { id: string; src: string[] }[]; cards?: { id: string; src: string[] }[] };
          shapes?: Shape[];
        };
        // Clear existing state before loading snapshot
        gameState.clearAgentShapes();
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
    }
  );

  // Register remaining tools dynamically
  for (const def of TOOL_DEFINITIONS) {
    if (def.name === "loadDeck" || def.name === "loadSnapshot") continue; // already registered

    const handler = handlers[def.name as keyof typeof handlers];
    if (!handler) continue;

    // Build zod schema from inputSchema
    const props =
      (def.inputSchema as { properties?: Record<string, unknown>; required?: string[] }).properties ?? {};
    const required = (def.inputSchema as { required?: string[] }).required ?? [];
    const zodShape: Record<string, z.ZodType> = {};

    for (const [key, schema] of Object.entries(props)) {
      const s = schema as { type: string; properties?: Record<string, { type: string }>; required?: string[] };
      let zodType: z.ZodType;
      if (s.type === "string") {
        zodType = z.string();
      } else if (s.type === "boolean") {
        zodType = z.boolean();
      } else if (s.type === "number") {
        zodType = z.number();
      } else if (s.type === "array") {
        zodType = z.array(z.number());
      } else if (s.type === "object" && s.properties) {
        // Build a proper z.object from nested properties
        const nested: Record<string, z.ZodType> = {};
        const nestedRequired = s.required ?? [];
        for (const [nk, ns] of Object.entries(s.properties)) {
          let nt: z.ZodType;
          if (ns.type === "string") nt = z.string();
          else if (ns.type === "number") nt = z.number();
          else if (ns.type === "boolean") nt = z.boolean();
          else nt = z.unknown();
          nested[nk] = nestedRequired.includes(nk) ? nt : nt.optional();
        }
        zodType = z.object(nested);
      } else if (s.type === "object") {
        zodType = z.record(z.string(), z.unknown());
      } else {
        zodType = z.unknown();
      }
      if (!required.includes(key)) {
        zodType = zodType.optional();
      }
      zodShape[key] = zodType;
    }

    // Capture handler in closure to avoid loop variable issues
    const capturedHandler = handler;

    if (Object.keys(zodShape).length === 0) {
      // No-parameter tool
      mcp.tool(def.name, def.description, async () => {
        return capturedHandler({});
      });
    } else {
      mcp.tool(def.name, def.description, zodShape, async (args) => {
        return capturedHandler(args as Record<string, unknown>);
      });
    }
  }

  // Start MCP over stdio
  const transport = new StdioServerTransport();
  await mcp.connect(transport);
  console.error("[maginet-agent] MCP server running on stdio");
}

main().catch((error: unknown) => {
  console.error("[maginet-agent] Fatal error:", error);
  process.exit(1);
});

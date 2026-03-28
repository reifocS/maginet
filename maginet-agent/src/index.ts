import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { AgentWebSocketServer } from "./server.js";
import { AgentGameState, type Shape } from "./state.js";
import { createToolHandlers, TOOL_DEFINITIONS } from "./mcp.js";
import { loadDeckFromList } from "./scryfall.js";
import type { Visibility } from "./visibility.js";

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

  // Listen for sync messages from the browser
  wsServer.onMessage((message) => {
    if (message.type === "sync:channel-snapshot" || message.type === "sync:channel-patch") {
      const payload = message.payload as Record<string, unknown>;
      if (payload && typeof payload === "object") {
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

  // Mutable context — handlers read current values of remoteShapes/remoteCardState
  const toolCtx = {
    state: gameState,
    server: wsServer,
    visibility,
    remoteShapes,
    get remoteCardState() {
      return remoteCardState;
    },
  };

  const handlers = createToolHandlers(toolCtx);

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
      const s = schema as { type: string };
      let zodType: z.ZodType;
      if (s.type === "string") {
        zodType = z.string();
      } else if (s.type === "boolean") {
        zodType = z.boolean();
      } else if (s.type === "number") {
        zodType = z.number();
      } else if (s.type === "array") {
        zodType = z.array(z.number());
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

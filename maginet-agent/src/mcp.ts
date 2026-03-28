import type { AgentGameState, Shape, Counter, Card } from "./state.js";
import type { AgentWebSocketServer } from "./server.js";
import { type Visibility, filterGameState } from "./visibility.js";

export interface ActionLogEntry {
  timestamp: number;
  action: string;
  playerId?: string;
  playerName?: string;
  cardsInHand?: number;
  cardNames?: string[];
}

export interface ToolContext {
  state: AgentGameState;
  server: AgentWebSocketServer;
  visibility: Visibility;
  remoteShapes: Record<string, Shape[]>;
  remoteCardState: { cards: number; deck: number } | null;
  actionLog: ActionLogEntry[];
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

function generateId(): string {
  return Math.random().toString(36).substr(2, 9);
}

export function createToolHandlers(ctx: ToolContext) {
  const { state } = ctx;

  return {
    async getGameState(_: Record<string, unknown>): Promise<ToolResult> {
      const raw = {
        agentHand: state.getHand(),
        agentDeck: state.getDeckContents(),
        boardShapes: {
          agent: state.getAgentShapes(),
          ...ctx.remoteShapes,
        },
        opponentHand: ctx.remoteCardState
          ? ([] as { id: string; src: string[] }[])
          : [],
        opponentDeckSize: ctx.remoteCardState?.deck ?? 0,
      };
      const filtered = filterGameState(raw, ctx.visibility);
      return ok(filtered);
    },

    async getHand(_: Record<string, unknown>): Promise<ToolResult> {
      const hand = state.getHand().map((card) => ({
        ...card,
        name: card.meta?.name,
        manaCost: card.meta?.manaCost,
        typeLine: card.meta?.typeLine,
        oracleText: card.meta?.oracleText,
        power: card.meta?.power,
        toughness: card.meta?.toughness,
      }));
      return ok(hand);
    },

    async getBoardState(_: Record<string, unknown>): Promise<ToolResult> {
      const enrichShape = (shape: Shape) => {
        const meta = state.lookupShapeMeta(shape);
        return meta ? { ...shape, cardName: meta.name, typeLine: meta.typeLine, oracleText: meta.oracleText, manaCost: meta.manaCost, power: meta.power, toughness: meta.toughness } : shape;
      };
      const board: Record<string, (Shape & { cardName?: string; typeLine?: string; oracleText?: string; manaCost?: string; power?: string; toughness?: string })[]> = {
        agent: state.getAgentShapes().map(enrichShape),
      };
      for (const [peerId, shapes] of Object.entries(ctx.remoteShapes)) {
        board[peerId] = shapes.map(enrichShape);
      }
      return ok(board);
    },

    async getDeckInfo(_: Record<string, unknown>): Promise<ToolResult> {
      const info: { size: number; contents?: { id: string; src: string[] }[] } = {
        size: state.getDeckSize(),
      };
      if (ctx.visibility === "full") {
        info.contents = state.getDeckContents();
      }
      return ok(info);
    },

    async drawCard(_: Record<string, unknown>): Promise<ToolResult> {
      const card = state.drawCard();
      if (!card) {
        return err("Deck is empty — cannot draw a card.");
      }
      return ok(card);
    },

    async mulligan(_: Record<string, unknown>): Promise<ToolResult> {
      state.mulligan();
      return ok({ message: "Hand shuffled back into deck.", deckSize: state.getDeckSize() });
    },

    async playCard(args: Record<string, unknown>): Promise<ToolResult> {
      const cardId = args.cardId as string;
      const position = args.position as [number, number] | undefined;
      const faceDown = (args.faceDown as boolean | undefined) ?? false;

      const card = state.playCard(cardId);
      if (!card) {
        return err(`Card "${cardId}" not found in hand.`);
      }

      const point = position ?? [
        Math.floor(Math.random() * 400),
        Math.floor(Math.random() * 400),
      ];

      const shape: Shape = {
        id: generateId(),
        point,
        size: [100, 100],
        type: "image",
        src: card.src,
        srcIndex: 0,
        rotation: 0,
        isFlipped: faceDown,
      };

      state.addAgentShape(shape);
      return ok({ message: "Card played.", shape });
    },

    async tapCard(args: Record<string, unknown>): Promise<ToolResult> {
      const shapeId = args.shapeId as string;
      const shape = state.findAgentShape(shapeId);
      if (!shape) {
        return err(`Shape "${shapeId}" not found.`);
      }
      const newRotation = (shape.rotation ?? 0) === 0 ? 90 : 0;
      state.updateAgentShape(shapeId, { rotation: newRotation });
      return ok({ shapeId, rotation: newRotation });
    },

    async untapAll(_: Record<string, unknown>): Promise<ToolResult> {
      const tapped = state.getAgentShapes().filter((s) => s.rotation && s.rotation !== 0);
      const updates = new Map(tapped.map((s) => [s.id, { rotation: 0 }]));
      state.updateAgentShapes(updates);
      return ok({ message: `Untapped ${tapped.length} card(s).` });
    },

    async sendToHand(args: Record<string, unknown>): Promise<ToolResult> {
      const shapeId = args.shapeId as string;
      const shape = state.findAgentShape(shapeId);
      if (!shape) {
        return err(`Shape "${shapeId}" not found.`);
      }
      state.removeAgentShape(shapeId);
      const meta = state.lookupShapeMeta(shape);
      const card = { id: generateId(), src: shape.src ?? [], ...(meta ? { meta } : {}) };
      state.sendToHand([card]);
      return ok({ message: "Card returned to hand.", card: { ...card, name: meta?.name } });
    },

    async sendToDeck(args: Record<string, unknown>): Promise<ToolResult> {
      const shapeId = args.shapeId as string;
      const position = (args.position as "top" | "bottom") ?? "bottom";
      const shape = state.findAgentShape(shapeId);
      if (!shape) {
        return err(`Shape "${shapeId}" not found.`);
      }
      state.removeAgentShape(shapeId);
      const meta = state.lookupShapeMeta(shape);
      const card = { id: generateId(), src: shape.src ?? [], ...(meta ? { meta } : {}) };
      state.sendToDeck([card], position);
      return ok({ message: `Card sent to ${position} of deck.`, deckSize: state.getDeckSize() });
    },

    async removeShape(args: Record<string, unknown>): Promise<ToolResult> {
      const shapeId = args.shapeId as string;
      const shape = state.findAgentShape(shapeId);
      if (!shape) {
        return err(`Shape "${shapeId}" not found.`);
      }
      state.removeAgentShape(shapeId);
      const meta = state.lookupShapeMeta(shape);
      return ok({ message: "Shape removed.", shapeId, cardName: meta?.name });
    },

    async shuffleDeck(_: Record<string, unknown>): Promise<ToolResult> {
      state.shuffleDeck();
      return ok({ message: "Deck shuffled.", deckSize: state.getDeckSize() });
    },

    async addCounter(args: Record<string, unknown>): Promise<ToolResult> {
      const shapeId = args.shapeId as string;
      const counter = args.counter as Counter;
      const shape = state.findAgentShape(shapeId);
      if (!shape) {
        return err(`Shape "${shapeId}" not found.`);
      }
      const existing = shape.counters ?? [];
      const updated = existing.some((c) => c.label === counter.label)
        ? existing.map((c) => (c.label === counter.label ? { ...c, ...counter } : c))
        : [...existing, counter];
      state.updateAgentShape(shapeId, { counters: updated });
      return ok({ shapeId, counters: updated });
    },

    async removeCounter(args: Record<string, unknown>): Promise<ToolResult> {
      const shapeId = args.shapeId as string;
      const label = args.label as string;
      const shape = state.findAgentShape(shapeId);
      if (!shape) {
        return err(`Shape "${shapeId}" not found.`);
      }
      const updated = (shape.counters ?? []).filter((c) => c.label !== label);
      state.updateAgentShape(shapeId, { counters: updated });
      return ok({ shapeId, counters: updated });
    },

    async flipCard(args: Record<string, unknown>): Promise<ToolResult> {
      const shapeId = args.shapeId as string;
      const shape = state.findAgentShape(shapeId);
      if (!shape) {
        return err(`Shape "${shapeId}" not found.`);
      }
      const newFlipped = !shape.isFlipped;
      state.updateAgentShape(shapeId, { isFlipped: newFlipped });
      return ok({ shapeId, isFlipped: newFlipped });
    },

    async placeText(args: Record<string, unknown>): Promise<ToolResult> {
      const text = args.text as string;
      const position = args.position as [number, number] | undefined;
      const fontSize = (args.fontSize as number | undefined) ?? 24;
      const color = (args.color as string | undefined) ?? "#ffffff";

      const point = position ?? [100, 100];
      const shape: Shape = {
        id: generateId(),
        point,
        size: [200, 50],
        type: "text",
        text,
        fontSize,
        color,
        srcIndex: 0,
        rotation: 0,
        isFlipped: false,
      };

      state.addAgentShape(shape);
      return ok({ message: "Text placed.", shape });
    },

    async updateText(args: Record<string, unknown>): Promise<ToolResult> {
      const shapeId = args.shapeId as string;
      const text = args.text as string;
      const shape = state.findAgentShape(shapeId);
      if (!shape) {
        return err(`Shape "${shapeId}" not found.`);
      }
      state.updateAgentShape(shapeId, { text });
      return ok({ shapeId, text });
    },

    async moveShape(args: Record<string, unknown>): Promise<ToolResult> {
      const shapeId = args.shapeId as string;
      const position = args.position as [number, number];
      const shape = state.findAgentShape(shapeId);
      if (!shape) return err(`Shape "${shapeId}" not found.`);
      state.updateAgentShape(shapeId, { point: position });
      return ok({ shapeId, point: position });
    },

    async placeRect(args: Record<string, unknown>): Promise<ToolResult> {
      const position = args.position as [number, number] | undefined;
      const size = args.size as [number, number] | undefined;
      const color = (args.color as string | undefined) ?? "#555555";

      const shape: Shape = {
        id: generateId(),
        point: position ?? [0, 0],
        size: size ?? [200, 150],
        type: "rectangle",
        color,
        srcIndex: 0,
        rotation: 0,
        isFlipped: false,
      };
      state.addAgentShape(shape);
      return ok({ message: "Rectangle placed.", shape });
    },

    async undo(_: Record<string, unknown>): Promise<ToolResult> {
      const success = state.undo();
      if (!success) return err("Nothing to undo.");
      return ok({ message: "Undone." });
    },

    async redo(_: Record<string, unknown>): Promise<ToolResult> {
      const success = state.redo();
      if (!success) return err("Nothing to redo.");
      return ok({ message: "Redone." });
    },

    async getActionLog(args: Record<string, unknown>): Promise<ToolResult> {
      const limit = (args.limit as number | undefined) ?? 20;
      const entries = ctx.actionLog.slice(-limit);
      return ok(entries);
    },

    async transformCard(args: Record<string, unknown>): Promise<ToolResult> {
      const shapeId = args.shapeId as string;
      const shape = state.findAgentShape(shapeId);
      if (!shape) {
        return err(`Shape "${shapeId}" not found.`);
      }
      const srcLength = shape.src?.length ?? 1;
      const newIndex = ((shape.srcIndex ?? 0) + 1) % srcLength;
      state.updateAgentShape(shapeId, { srcIndex: newIndex });
      return ok({ shapeId, srcIndex: newIndex });
    },
  };
}

export const TOOL_DEFINITIONS = [
  {
    name: "getGameState",
    description:
      "Get a full snapshot of the current game: your hand, deck size, board shapes, and opponent info.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "getHand",
    description: "Get the cards currently in your hand.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "getBoardState",
    description: "Get all shapes on the board, grouped by player.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "getDeckInfo",
    description:
      "Get deck size. In full visibility mode, also returns deck contents.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "drawCard",
    description: "Draw the top card from your deck into your hand.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "mulligan",
    description: "Shuffle your entire hand back into your deck.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "playCard",
    description: "Play a card from your hand onto the board.",
    inputSchema: {
      type: "object",
      properties: {
        cardId: { type: "string" },
        position: { type: "array", items: { type: "number" } },
        faceDown: { type: "boolean" },
      },
      required: ["cardId"],
    },
  },
  {
    name: "tapCard",
    description: "Toggle tap/untap on a card.",
    inputSchema: {
      type: "object",
      properties: { shapeId: { type: "string" } },
      required: ["shapeId"],
    },
  },
  {
    name: "untapAll",
    description: "Untap all your cards on the board.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "sendToHand",
    description: "Return a card from the board back to your hand.",
    inputSchema: {
      type: "object",
      properties: { shapeId: { type: "string" } },
      required: ["shapeId"],
    },
  },
  {
    name: "sendToDeck",
    description: "Return a card from the board to your deck.",
    inputSchema: {
      type: "object",
      properties: {
        shapeId: { type: "string" },
        position: { type: "string", enum: ["top", "bottom"] },
      },
      required: ["shapeId"],
    },
  },
  {
    name: "shuffleDeck",
    description: "Shuffle your deck.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "addCounter",
    description: "Add or update a counter on a card.",
    inputSchema: {
      type: "object",
      properties: {
        shapeId: { type: "string" },
        counter: {
          type: "object",
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
      type: "object",
      properties: {
        shapeId: { type: "string" },
        label: { type: "string" },
      },
      required: ["shapeId", "label"],
    },
  },
  {
    name: "removeShape",
    description: "Remove a shape from the board (e.g. destroy a token, remove resolved spell).",
    inputSchema: {
      type: "object",
      properties: { shapeId: { type: "string" } },
      required: ["shapeId"],
    },
  },
  {
    name: "undo",
    description: "Undo the last game action (draw, play, shape change, etc).",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "redo",
    description: "Redo a previously undone action.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "moveShape",
    description: "Move a shape to a new position on the board.",
    inputSchema: {
      type: "object",
      properties: {
        shapeId: { type: "string" },
        position: { type: "array", items: { type: "number" } },
      },
      required: ["shapeId", "position"],
    },
  },
  {
    name: "placeRect",
    description: "Place a rectangle on the board (e.g. for zones like graveyard, exile).",
    inputSchema: {
      type: "object",
      properties: {
        position: { type: "array", items: { type: "number" } },
        size: { type: "array", items: { type: "number" } },
        color: { type: "string" },
      },
    },
  },
  {
    name: "getActionLog",
    description: "Get recent game actions from the opponent (draws, plays, shuffles, etc).",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number" },
      },
    },
  },
  {
    name: "placeText",
    description: "Place a text label on the board (e.g. for HP counters, notes).",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string" },
        position: { type: "array", items: { type: "number" } },
        fontSize: { type: "number" },
        color: { type: "string" },
      },
      required: ["text"],
    },
  },
  {
    name: "updateText",
    description: "Update the text content of an existing text shape.",
    inputSchema: {
      type: "object",
      properties: {
        shapeId: { type: "string" },
        text: { type: "string" },
      },
      required: ["shapeId", "text"],
    },
  },
  {
    name: "flipCard",
    description: "Toggle a card between face-up and face-down.",
    inputSchema: {
      type: "object",
      properties: { shapeId: { type: "string" } },
      required: ["shapeId"],
    },
  },
  {
    name: "transformCard",
    description: "Switch a double-faced card to its other face.",
    inputSchema: {
      type: "object",
      properties: { shapeId: { type: "string" } },
      required: ["shapeId"],
    },
  },
];

export interface CardMeta {
  name: string;
  typeLine?: string;
  oracleText?: string;
  manaCost?: string;
  power?: string;
  toughness?: string;
}

export interface Card {
  id: string;
  src: string[];
  meta?: CardMeta;
}

export interface CardState {
  cards: Card[];
  deck: Card[];
  lastAction?: string;
  actionId?: number;
}

export interface Counter {
  label: string;
  power?: number;
  toughness?: number;
  value?: number;
  color?: string;
}

export interface Shape {
  id: string;
  point: number[];
  size: number[];
  type: "rectangle" | "circle" | "arrow" | "text" | "image" | "token";
  text?: string;
  src?: string[];
  srcIndex: number;
  rotation?: number;
  isFlipped?: boolean;
  fontSize?: number;
  counters?: Counter[];
  color?: string;
}

function generateId(): string {
  return Math.random().toString(36).substr(2, 9);
}

function shuffle<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

interface Snapshot {
  cardState: CardState;
  agentShapes: Shape[];
}

const MAX_UNDO_HISTORY = 30;

export class AgentGameState {
  private cardState: CardState = { cards: [], deck: [], actionId: 0 };
  private agentShapes: Shape[] = [];
  private shapeListeners = new Set<(next: Shape[], prev: Shape[]) => void>();
  private cardMetaByImage = new Map<string, CardMeta>();
  private undoStack: Snapshot[] = [];
  private redoStack: Snapshot[] = [];

  private saveSnapshot(): void {
    this.undoStack.push({
      cardState: { ...this.cardState, cards: [...this.cardState.cards], deck: [...this.cardState.deck] },
      agentShapes: this.agentShapes.map((s) => ({ ...s })),
    });
    if (this.undoStack.length > MAX_UNDO_HISTORY) {
      this.undoStack.shift();
    }
    this.redoStack = [];
  }

  undo(): boolean {
    const snapshot = this.undoStack.pop();
    if (!snapshot) return false;
    this.redoStack.push({
      cardState: { ...this.cardState, cards: [...this.cardState.cards], deck: [...this.cardState.deck] },
      agentShapes: this.agentShapes.map((s) => ({ ...s })),
    });
    const prev = this.agentShapes;
    this.cardState = snapshot.cardState;
    this.agentShapes = snapshot.agentShapes;
    this.notifyShapeChange(prev);
    return true;
  }

  redo(): boolean {
    const snapshot = this.redoStack.pop();
    if (!snapshot) return false;
    this.undoStack.push({
      cardState: { ...this.cardState, cards: [...this.cardState.cards], deck: [...this.cardState.deck] },
      agentShapes: this.agentShapes.map((s) => ({ ...s })),
    });
    const prev = this.agentShapes;
    this.cardState = snapshot.cardState;
    this.agentShapes = snapshot.agentShapes;
    this.notifyShapeChange(prev);
    return true;
  }

  lookupCardMeta(imageUrl: string): CardMeta | undefined {
    return this.cardMetaByImage.get(imageUrl);
  }

  lookupShapeMeta(shape: Shape): CardMeta | undefined {
    if (!shape.src?.length) return undefined;
    return this.cardMetaByImage.get(shape.src[0]);
  }

  registerCardMeta(imageUrl: string, meta: CardMeta): void {
    this.cardMetaByImage.set(imageUrl, meta);
  }

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
    return () => {
      this.shapeListeners.delete(listener);
    };
  }

  private notifyShapeChange(prev: Shape[]): void {
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
    // Build image URL → metadata lookup
    for (const card of cards) {
      if (card.meta && card.src.length > 0) {
        this.cardMetaByImage.set(card.src[0], card.meta);
      }
    }
  }

  drawCard(): Card | null {
    if (this.cardState.deck.length === 0) return null;
    this.saveSnapshot();
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
    this.saveSnapshot();
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
    this.saveSnapshot();
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
    this.saveSnapshot();
    const prev = this.agentShapes;
    this.agentShapes = [...this.agentShapes, shape];
    this.notifyShapeChange(prev);
  }

  removeAgentShape(shapeId: string): void {
    this.saveSnapshot();
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

  /** Batch-update multiple shapes, notifying listeners only once. */
  updateAgentShapes(updatesById: Map<string, Partial<Shape>>): void {
    const prev = this.agentShapes;
    this.agentShapes = this.agentShapes.map((s) => {
      const updates = updatesById.get(s.id);
      return updates ? { ...s, ...updates } : s;
    });
    this.notifyShapeChange(prev);
  }

  clearAgentShapes(): void {
    const prev = this.agentShapes;
    this.agentShapes = [];
    this.notifyShapeChange(prev);
  }

  findAgentShape(shapeId: string): Shape | undefined {
    return this.agentShapes.find((s) => s.id === shapeId);
  }
}

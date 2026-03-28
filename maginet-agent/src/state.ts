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

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
  type_line?: string;
  oracle_text?: string;
  mana_cost?: string;
  power?: string;
  toughness?: string;
}

interface ScryfallCollection {
  data: ScryfallCard[];
  not_found: Array<{ name: string }>;
}

export interface CardMeta {
  name: string;
  typeLine?: string;
  oracleText?: string;
  manaCost?: string;
  power?: string;
  toughness?: string;
}

export interface DeckCard {
  id: string;
  src: string[];
  meta?: CardMeta;
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
  const meta: CardMeta = {
    name: card.name,
    typeLine: card.type_line,
    oracleText: card.oracle_text,
    manaCost: card.mana_cost,
    power: card.power,
    toughness: card.toughness,
  };

  if (card.image_uris?.normal) {
    return { id: generateId(), src: [card.image_uris.normal], meta };
  }
  if (card.card_faces?.length) {
    return {
      id: generateId(),
      src: card.card_faces.map((face) => face.image_uris.normal),
      meta,
    };
  }
  throw new Error(`No image found for card: ${card.name}`);
}

export async function loadDeckFromList(deckList: string): Promise<DeckCard[]> {
  const names = parseDeckList(deckList);
  if (names.length === 0) throw new Error("Empty deck list");
  if (names.length > 200) throw new Error("Deck list too large (max 200 cards)");

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

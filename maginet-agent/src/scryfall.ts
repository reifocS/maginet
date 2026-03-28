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
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
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
    const facesWithImages = card.card_faces.filter((face) => face.image_uris?.normal);
    if (facesWithImages.length > 0) {
      return {
        id: generateId(),
        src: facesWithImages.map((face) => face.image_uris.normal),
        meta,
      };
    }
  }
  throw new Error(`No image found for card: ${card.name}`);
}

/** Extract Scryfall card UUID from an image URL like https://cards.scryfall.io/normal/front/2/d/2dfe1926-...jpg */
function extractScryfallUuid(imageUrl: string): string | null {
  const match = imageUrl.match(/\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\./);
  return match?.[1] ?? null;
}

/** Fetch card metadata from Scryfall by image URL. Returns null if lookup fails. */
export async function fetchCardMetaByImageUrl(imageUrl: string): Promise<{ imageUrl: string; meta: CardMeta } | null> {
  const uuid = extractScryfallUuid(imageUrl);
  if (!uuid) return null;
  try {
    const response = await fetch(`https://api.scryfall.com/cards/${uuid}`);
    if (!response.ok) return null;
    const card = await response.json() as ScryfallCard;
    return {
      imageUrl,
      meta: {
        name: card.name,
        typeLine: card.type_line,
        oracleText: card.oracle_text ?? (card.card_faces as unknown as ScryfallCard[])?.[0]?.oracle_text,
        manaCost: card.mana_cost ?? (card.card_faces as unknown as ScryfallCard[])?.[0]?.mana_cost,
        power: card.power,
        toughness: card.toughness,
      },
    };
  } catch {
    return null;
  }
}

export async function loadDeckFromList(deckList: string): Promise<DeckCard[]> {
  const names = parseDeckList(deckList);
  if (names.length === 0) throw new Error("Empty deck list");
  if (names.length > 200) throw new Error("Deck list too large (max 200 cards)");

  // Count how many copies of each card are needed
  const countMap = new Map<string, number>();
  for (const name of names) {
    countMap.set(name, (countMap.get(name) ?? 0) + 1);
  }

  // Send only unique names to Scryfall (it deduplicates anyway)
  const uniqueNames = [...countMap.keys()];
  const chunks: string[][] = [];
  const remaining = [...uniqueNames];
  while (remaining.length > 0) {
    chunks.push(remaining.splice(0, 75));
  }

  const collections = await Promise.all(chunks.map(fetchCards));

  const notFound = collections.flatMap((c) => c.not_found.map((nf) => nf.name));
  if (notFound.length > 0) {
    console.warn(`Cards not found: ${notFound.join(", ")}`);
  }

  // Expand each Scryfall result back to the requested number of copies
  const cards = collections.flatMap((c) =>
    c.data.flatMap((scryfallCard) => {
      const count = countMap.get(scryfallCard.name) ?? 1;
      return Array.from({ length: count }, () => scryfallCardToDeckCard(scryfallCard));
    })
  );
  return shuffle(cards);
}

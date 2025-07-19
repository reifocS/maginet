/* eslint-disable @typescript-eslint/no-explicit-any */
import { useQuery } from "@tanstack/react-query";
import { useCallback } from "react";
import { generateId, shuffle } from "../utils/math";
import { Card } from "../types/canvas";

const fetchCards = async (names: string[]) => {
  const response = await fetch("https://api.scryfall.com/cards/collection", {
    method: "POST",
    mode: "cors",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      identifiers: names.map((name) => ({ name })),
    }),
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json();
};

const getCards = async (names: string[]) => {
  names = [...names];
  if (names.length <= 75) {
    return [await fetchCards(names)];
  }
  if (names.length > 200) {
    throw new Error("Too much cards");
  }

  const cardPromises = [];
  while (names.length) {
    const chunk = names.splice(0, 75).filter(Boolean);
    cardPromises.push(fetchCards(chunk));
  }

  const cardArrays = await Promise.all(cardPromises);
  return cardArrays.flat();
};

function useCards(names: string[]) {
  // Queries
  return useQuery<CardCollection[], Error, Datum[]>({
    queryKey: ["decks", names],
    queryFn: () => getCards(names),
    enabled: names.length > 0,
    structuralSharing: false,
    refetchOnWindowFocus: false,
    select: useCallback((data: CardCollection[]) => {
      const cards = data.flatMap((d) => d.data);
      for (const d of data) {
        if (d.not_found && d.not_found.length > 0) {
          console.warn(
            `${d.not_found
              .map((not_found) => not_found.name)
              .join(", ")} not found`
          );
        }
      }
      return shuffle(cards);
    }, []),
  });
}
export default useCards;

export interface CardCollection {
  object: string;
  not_found: any[];
  data: Datum[];
}

export interface Datum {
  object: string;
  id: string;
  oracle_id: string;
  card_faces?: Datum[];
  all_parts: {
    object: string;
    id: string;
    component: string;
    name: string;
    type_line: string;
    uri: string;
  }[];
  multiverse_ids: number[];
  mtgo_id: number;
  mtgo_foil_id: number;
  tcgplayer_id: number;
  cardmarket_id: number;
  name: string;
  lang: string;
  released_at: Date;
  uri: string;
  scryfall_uri: string;
  layout: string;
  highres_image: boolean;
  image_status: string;
  image_uris: ImageUris;
  mana_cost: string;
  cmc: number;
  type_line: string;
  oracle_text: string;
  power?: string;
  toughness?: string;
  colors: any[];
  color_identity: any[];
  keywords: any[];
  legalities: Legalities;
  games: string[];
  reserved: boolean;
  foil: boolean;
  nonfoil: boolean;
  finishes: string[];
  oversized: boolean;
  promo: boolean;
  reprint: boolean;
  variation: boolean;
  set_id: string;
  set: string;
  set_name: string;
  set_type: string;
  set_uri: string;
  set_search_uri: string;
  scryfall_set_uri: string;
  rulings_uri: string;
  prints_search_uri: string;
  collector_number: string;
  digital: boolean;
  rarity: string;
  flavor_text?: string;
  card_back_id: string;
  artist: string;
  artist_ids: string[];
  illustration_id: string;
  border_color: string;
  frame: string;
  security_stamp?: string;
  full_art: boolean;
  textless: boolean;
  booster: boolean;
  story_spotlight: boolean;
  edhrec_rank: number;
  penny_rank?: number;
  prices: Prices;
  related_uris: RelatedUris;
  purchase_uris: PurchaseUris;
  produced_mana?: string[];
}

export interface ImageUris {
  small: string;
  normal: string;
  large: string;
  png: string;
  art_crop: string;
  border_crop: string;
}

export interface Legalities {
  standard: string;
  future: string;
  historic: string;
  gladiator: string;
  pioneer: string;
  explorer: string;
  modern: string;
  legacy: string;
  pauper: string;
  vintage: string;
  penny: string;
  commander: string;
  oathbreaker: string;
  brawl: string;
  historicbrawl: string;
  alchemy: string;
  paupercommander: string;
  duel: string;
  oldschool: string;
  premodern: string;
  predh: string;
}

export interface Prices {
  usd: string;
  usd_foil: string;
  usd_etched: null;
  eur: string;
  eur_foil: string;
  tix: string;
}

export interface PurchaseUris {
  tcgplayer: string;
  cardmarket: string;
  cardhoarder: string;
}

export interface RelatedUris {
  gatherer: string;
  tcgplayer_infinite_articles: string;
  tcgplayer_infinite_decks: string;
  edhrec: string;
}
export function processRawText(fromArena: string) {
  if (fromArena.trim() === "") return [];
  return fromArena.split("\n").flatMap((s) => {
    const match = s.match(/^(\d+)\s+(.*?)(?:\s*\/\/.*)?$/);
    if (match) {
      const [, count, name] = match;
      return Array(Number(count)).fill(name.trim());
    }
    return [];
  });
}
export function mapDataToCards(data?: Datum[]): Card[] {
  return data?.map(mapDataToCard) ?? [];
}

export function mapDataToCard(data: Datum): Card {
  if (data.image_uris?.normal) {
    return {
      id: generateId(),
      src: [data.image_uris.normal],
      srcIndex: 0,
      name: data.name,
    };
  } else if (data.card_faces?.length) {
    return {
      id: generateId(),
      src: data.card_faces.map((face) => face.image_uris.normal),
      srcIndex: 0,
      name: data.name,
    };
  }
  throw new Error("Invalid card data");
}

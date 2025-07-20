export interface Card {
  id: string;
  src: string[];
  srcIndex?: number;
  name?: string;
  isRelatedCard?: boolean;
  relatedTo?: string;
}
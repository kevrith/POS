// Which kitchen station prepares an item, and which printer serves that station.

import type { KotItem } from './model';

export const DEFAULT_STATION = 'KOT_FOOD';

/** Legacy fallback for items whose category has no explicit station. Most specific station first. */
const STATION_KEYWORDS: Array<[station: string, keywords: string[]]> = [
  ['KOT_DESSERTS', ['dessert', 'cake', 'ice cream', 'sweet', 'pastry']],
  ['KOT_DRINKS', ['drink', 'beverage', 'juice', 'soda', 'water', 'beer', 'wine', 'spirits', 'coffee', 'tea', 'milk', 'smoothie', 'cocktail', 'mocktail']],
  ['KOT_FOOD', ['food', 'main', 'snack', 'starter', 'salad', 'soup', 'pizza', 'burger', 'chicken', 'beef', 'pork', 'fish', 'bread']],
];

const STATION_PATTERN = /^KOT_[A-Z0-9_]{1,32}$/;

/** The kitchen-ticket stations stored on items (see KOT_STATIONS in @pos/shared) and the printer handle serving each. */
const STATION_ALIASES: Record<string, string> = {
  KITCHEN: 'KOT_FOOD',
  BAR: 'KOT_DRINKS',
  DESSERT: 'KOT_DESSERTS',
};

/** A printer handle (KOT_FOOD) for a stored station (KITCHEN or KOT_FOOD), or null if it is neither. */
export function stationHandle(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const upper = value.trim().toUpperCase();
  if (STATION_ALIASES[upper]) return STATION_ALIASES[upper];
  return STATION_PATTERN.test(upper) ? upper : null;
}

/** Whole-word match (optionally plural), so "water" matches "Water 500ml" but not "Watermelon". */
function mentions(text: string, keyword: string): boolean {
  const padded = ` ${text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()} `;
  return padded.includes(` ${keyword} `) || padded.includes(` ${keyword}s `);
}

export function resolveStation(item: Pick<KotItem, 'name' | 'category' | 'station'>): string {
  const explicit = stationHandle(item.station);
  if (explicit) return explicit;
  const target = item.category ?? item.name;
  for (const [station, keywords] of STATION_KEYWORDS) {
    if (keywords.some((kw) => mentions(target, kw))) return station;
  }
  return DEFAULT_STATION;
}

export interface RoutablePrinter {
  id?: string;
  connectionType: string;
  connectionDetails: string;
  /** The API stores handles as a JSON string; callers may also pass the parsed array. */
  handles: string[] | string;
}

export function parseHandles(handles: RoutablePrinter['handles'] | null | undefined): string[] {
  if (Array.isArray(handles)) return handles;
  if (!handles) return [];
  try {
    const parsed = JSON.parse(handles);
    return Array.isArray(parsed) ? parsed.filter((h): h is string => typeof h === 'string') : [];
  } catch {
    return [];
  }
}

export interface KotRoute<P extends RoutablePrinter = RoutablePrinter> {
  station: string;
  items: KotItem[];
  /** The printer that handles this station, or null when none is configured. */
  printer: P | null;
}

/** Split a ticket's items by station and pick the printer that handles each one. */
export function routeKotItems<P extends RoutablePrinter>(items: KotItem[], printers: P[]): Array<KotRoute<P>> {
  const byStation = new Map<string, KotItem[]>();
  for (const item of items) {
    const station = resolveStation(item);
    const list = byStation.get(station);
    if (list) list.push(item);
    else byStation.set(station, [item]);
  }
  return Array.from(byStation.entries()).map(([station, stationItems]) => ({
    station,
    items: stationItems,
    printer: printers.find((p) => parseHandles(p.handles).includes(station)) ?? null,
  }));
}

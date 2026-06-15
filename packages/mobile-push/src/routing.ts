/**
 * Pure helpers for interpreting a push notification's `data` payload.
 *
 * Deliberately imports NOTHING native so it runs under plain-Node ts-jest and is
 * shared identically by every app. Each app maps the parsed `{ type, id }` to its
 * own route (the apps have different route trees), so this stays app-agnostic.
 */
export interface NotificationData {
  /** Domain of the notification, e.g. 'delivery' | 'order' | 'collection' | 'low_stock'. */
  type?: string;
  /** The id of the entity the notification refers to, if any. */
  id?: string;
  /** The full original payload, for callers that need extra fields. */
  raw: Record<string, unknown>;
}

/** Safely normalise an Expo notification's arbitrary `data` into type + id. */
export function parseNotificationData(raw: unknown): NotificationData {
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const type = typeof obj.type === 'string' ? obj.type : undefined;
  const idVal = obj.id ?? obj.entityId;
  const id = typeof idVal === 'string' ? idVal : typeof idVal === 'number' ? String(idVal) : undefined;
  return { type, id, raw: obj };
}

/**
 * Optional default route map: `type` -> a path *template* using `:id`.
 * Apps pass their own map; this is just a sensible starting set. `resolveRoute`
 * substitutes the id and returns null when no mapping applies (so the app can
 * fall back to its home screen instead of navigating somewhere wrong).
 */
export type RouteMap = Record<string, string>;

export function resolveRoute(data: NotificationData, map: RouteMap): string | null {
  if (!data.type) return null;
  const template = map[data.type];
  if (!template) return null;
  if (template.includes(':id')) {
    if (!data.id) return null;
    return template.replace(':id', data.id);
  }
  return template;
}

/**
 * Reorder helpers for the customer app.
 *
 * Portal orders store their line items only as a text summary in `notes`
 * (portal.service.placeOrder writes `"${orderType}: 2x Pizza, 1x Coke. <notes>"`).
 * To reorder we parse that summary and match the names back to the live menu to
 * recover ids + current prices. Pure + unit-tested.
 */
export interface ParsedLine {
  quantity: number;
  name: string;
}

export interface MenuItemLite {
  id: string;
  name: string;
  retailPriceCents: number;
}

export interface ReorderMatch {
  matched: Array<MenuItemLite & { quantity: number }>;
  missing: string[];
}

/** Pull the "Nx Name" tokens out of a portal order's notes string. */
export function parseOrderItems(notes?: string | null): ParsedLine[] {
  if (!notes) return [];
  // Drop the leading "DELIVERY:" / "PICKUP:" label.
  const body = notes.replace(/^\s*(DELIVERY|PICKUP)\s*:\s*/i, '');
  const lines: ParsedLine[] = [];
  for (const seg of body.split(',')) {
    const m = seg.trim().match(/^(\d+)\s*x\s*(.+)$/i);
    if (!m) continue;
    // The last item may carry a trailing ". <custom note>" — strip it.
    const name = m[2].split('. ')[0].trim();
    const quantity = parseInt(m[1], 10);
    if (name && quantity > 0) lines.push({ quantity, name });
  }
  return lines;
}

/** Match parsed lines to live menu items by name (case-insensitive). */
export function matchOrderToMenu(lines: ParsedLine[], menu: MenuItemLite[]): ReorderMatch {
  const byName = new Map(menu.map((m) => [m.name.trim().toLowerCase(), m]));
  const matched: ReorderMatch['matched'] = [];
  const missing: string[] = [];
  for (const line of lines) {
    const hit = byName.get(line.name.toLowerCase());
    if (hit) matched.push({ ...hit, quantity: line.quantity });
    else missing.push(line.name);
  }
  return { matched, missing };
}

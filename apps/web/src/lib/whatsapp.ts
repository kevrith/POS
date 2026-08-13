/**
 * WhatsApp deep links.
 *
 * `wa.me` opens the sender's own WhatsApp with the message pre-filled; they tap send.
 * That matters more than it sounds: the message arrives from the business's real
 * number — the one customers already have saved and reply to — and it needs no Meta
 * Business approval, no dedicated phone line and no per-message fee.
 *
 * The alternative is Meta's Cloud API, which sends server-side with no human tap but
 * requires a number dedicated to the API (it can no longer be used in the WhatsApp app
 * itself) and pre-approved templates. If that is ever wired up, it belongs behind the
 * same call sites as these helpers.
 */

/** Kenyan numbers are typed as 07…, +254…, or 254…; wa.me wants bare digits with the
 *  country code and no leading zero. Returns null when there is nothing dialable. */
export function normalisePhone(raw?: string | null): string | null {
  if (!raw) return null;
  const digits = raw.replace(/[^0-9]/g, '');
  if (digits.length < 9) return null;
  if (digits.startsWith('254')) return digits;
  if (digits.startsWith('0')) return `254${digits.slice(1)}`;
  if (digits.length === 9) return `254${digits}`;
  return digits; // already international, some other country
}

/** Browsers cap URL length; a long receipt would otherwise silently fail to open. */
const MAX_MESSAGE_CHARS = 1500;

export function whatsappUrl(phone: string | null | undefined, message: string): string | null {
  const to = normalisePhone(phone);
  if (!to) return null;
  const text = message.length > MAX_MESSAGE_CHARS
    ? `${message.slice(0, MAX_MESSAGE_CHARS - 1)}…`
    : message;
  return `https://wa.me/${to}?text=${encodeURIComponent(text)}`;
}

/**
 * Open WhatsApp with the message ready to send. Returns false when the number is
 * unusable or the browser blocked the popup, so the caller can say so.
 */
export function openWhatsApp(phone: string | null | undefined, message: string): boolean {
  const url = whatsappUrl(phone, message);
  if (!url) return false;
  return window.open(url, '_blank', 'noopener,noreferrer') !== null;
}

export interface ReceiptMessageInput {
  businessName: string;
  receiptNumber: string;
  date: string;
  items: Array<{ name: string; quantity: number; totalCents: number }>;
  subtotalCents?: number;
  discountCents?: number;
  taxCents?: number;
  totalCents: number;
  customerName?: string;
}

const money = (cents: number) =>
  `KES ${(cents / 100).toLocaleString('en-KE', { minimumFractionDigits: 2 })}`;

/** Plain text with WhatsApp's *bold* markers — it has to stay readable on a phone. */
export function buildReceiptMessage(r: ReceiptMessageInput): string {
  const lines: string[] = [`*${r.businessName}*`, `Receipt ${r.receiptNumber}`];
  lines.push(new Date(r.date).toLocaleString('en-KE', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }));
  if (r.customerName) lines.push(`For: ${r.customerName}`);
  lines.push('');

  // A long till receipt would blow the URL limit, so show the first lines and count
  // the rest rather than truncating mid-item.
  const shown = r.items.slice(0, 12);
  for (const item of shown) {
    lines.push(`${item.quantity} × ${item.name} — ${money(item.totalCents)}`);
  }
  if (r.items.length > shown.length) {
    lines.push(`…and ${r.items.length - shown.length} more item(s)`);
  }

  lines.push('');
  if (r.discountCents) lines.push(`Discount: -${money(r.discountCents)}`);
  if (r.taxCents) lines.push(`VAT: ${money(r.taxCents)}`);
  lines.push(`*Total: ${money(r.totalCents)}*`);
  lines.push('');
  lines.push('Thank you for your business.');

  return lines.join('\n');
}

/** Shillings typed by a person, as the whole cents the API takes. */
export function kesToCents(input: string | number | null | undefined): number | null {
  if (input === null || input === undefined) return null;
  const text = String(input).trim().replace(/,/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return null;
  return Math.round(parseFloat(text) * 100);
}

/** Cents as a plain figure for an input box ("195.50"). */
export function centsToInput(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return '';
  return (cents / 100).toFixed(2);
}

export const litres = (n: number | null | undefined, digits = 2) => (n === null || n === undefined ? '-' : `${n.toLocaleString('en-KE', { minimumFractionDigits: digits, maximumFractionDigits: digits })} L`);

/** A litre count typed by a person; null when it is not a plain non-negative number. */
export function parseLitres(input: string): number | null {
  const t = input.trim().replace(/,/g, '');
  if (!/^\d+(\.\d{1,3})?$/.test(t)) return null;
  return parseFloat(t);
}

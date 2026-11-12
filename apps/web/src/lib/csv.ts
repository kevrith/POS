/** Writing a table as CSV safely: quoting what needs it, and defusing text a spreadsheet would run as a formula. */

/** A spreadsheet treats a cell that starts with = + - or @ as a formula, so such text is made plain with a leading quote. */
export const csvCell = (v: string | number | null | undefined): string => {
  const s = v === null || v === undefined ? '' : String(v);
  const safe = /^[=+\-@\t\r]/.test(s) && Number.isNaN(Number(s)) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

export const toCsv = (rows: Array<Array<string | number | null | undefined>>): string => rows.map((line) => line.map(csvCell).join(',')).join('\r\n');

/** Hand a CSV to the browser as a download (with the marker Excel needs to read UTF-8). */
export function downloadCsv(filename: string, csv: string): void {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' }));
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

import {
  DRAWER_PULSE, PAPER_COLUMNS, asciiSafe, billEscPos, billHtml, bytesToBase64, formatAmount, formatKES, groupPayments,
  kotEpsonXml, kotEscPos, kotHtml, kotStarXml, qrMatrix, qrSvg, receiptEpsonXml, receiptEscPos, receiptHtml,
  columnRuler, diagnosticEpsonXml, diagnosticEscPos, diagnosticHtml, diagnosticStarXml, receiptOpensDrawer, receiptStarXml, resolveStation, routeKotItems, row, wrapText,
  type BillDocument, type KotDocument, type ReceiptDocument,
} from '../src';

/** Printed text of an ESC/POS job: command sequences removed, lines split on LF. */
function printedLines(bytes: Uint8Array): string[] {
  const out: number[] = [];
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    if (b === 0x1b) {
      const c = bytes[i + 1];
      i += c === 0x40 ? 1 : c === 0x70 ? 4 : 2; // ESC @ | ESC p m t1 t2 | ESC x n
      continue;
    }
    if (b === 0x1d) {
      if (bytes[i + 1] === 0x28) i += 4 + (bytes[i + 3] | (bytes[i + 4] << 8)); // GS ( k pL pH data
      else i += 3;                                                              // GS V A 0
      continue;
    }
    out.push(b);
  }
  return Buffer.from(out).toString('latin1').split('\n');
}

const base: ReceiptDocument = {
  receiptNumber: 'NRB01-000123',
  businessName: 'Premier Cafe',
  storeName: 'Nairobi CBD',
  date: '2026-10-27T10:15:00',
  cashierName: 'Amina',
  items: [
    { name: 'Cappuccino large with extra shot and oat milk', quantity: 2, unitPriceCents: 35000, totalCents: 70000 },
    { name: 'Espresso', quantity: 1, unitPriceCents: 25000, totalCents: 25000, discountPercent: 10 },
  ],
  subtotalCents: 95000,
  vatCents: 13103,
  totalCents: 95000,
  payments: [{ method: 'CASH', amountCents: 100000 }],
  changeCents: 5000,
  etimsSubmitted: true,
  etimsControlNumber: 'CU-0001234',
  kraQRCode: 'https://etims.kra.go.ke/verify?x=ABC123',
};

const allFormats = (doc: ReceiptDocument, paperWidth: 58 | 80 = 58) => {
  const o = { paperWidth };
  return {
    escpos: printedLines(receiptEscPos(doc, o)).join('\n'),
    html: receiptHtml(doc, o),
    epson: receiptEpsonXml(doc, o),
    star: receiptStarXml(doc, o),
  };
};

describe('text helpers', () => {
  it('reduces user text to printable ASCII', () => {
    expect(asciiSafe('Café “Mocha” – Large')).toBe('Cafe "Mocha" - Large');
    expect(asciiSafe('Line\nbreak')).toBe('Line break');
    expect(asciiSafe('日本')).toBe('??');
  });

  it('formats money deterministically', () => {
    expect(formatAmount(123456789)).toBe('1,234,567.89');
    expect(formatKES(5)).toBe('KES 0.05');
    expect(formatKES(-150)).toBe('KES -1.50');
  });

  it('wraps long words and keeps the amount column on one line', () => {
    expect(wrapText('A'.repeat(40), 32)).toEqual(['A'.repeat(32), 'A'.repeat(8)]);
    const r = row('Subtotal (ex-VAT):', 'KES 1,234,567.89', 32);
    expect(r).toHaveLength(32);
    expect(r.endsWith('KES 1,234,567.89')).toBe(true);
  });

  it('base64 matches Buffer for every tail length', () => {
    for (const n of [0, 1, 2, 3, 4, 5, 100]) {
      const bytes = Uint8Array.from({ length: n }, (_, i) => (i * 37 + 250) & 0xff);
      expect(bytesToBase64(bytes)).toBe(Buffer.from(bytes).toString('base64'));
    }
  });
});

describe('fiscal status appears on EVERY printer format', () => {
  const cases: Array<[string, Partial<ReceiptDocument>, string]> = [
    ['void', { voided: true }, 'VOID'],
    ['credit sale', { isCreditSale: true, customerName: 'Mama Njeri', newBalanceCents: -95000 }, 'CREDIT SALE'],
    ['pending eTIMS', { etimsSubmitted: false, etimsControlNumber: undefined }, 'PENDING KRA SUBMISSION'],
    ['reprint', { copyNumber: 2 }, 'COPY 2'],
    ['eTIMS test mode', { etimsTestMode: true }, 'TEST MODE'],
    ['offline sale', { offlineSale: true }, 'OFFLINE SALE'],
  ];

  it.each(cases)('%s', (_name, patch, marker) => {
    const f = allFormats({ ...base, ...patch });
    expect(f.escpos).toContain(marker);
    expect(f.html).toContain(marker);
    expect(f.epson).toContain(marker);
    expect(f.star).toContain(marker);
  });

  it('a test-mode sale is never shown as verified and carries no QR or control number', () => {
    const f = allFormats({ ...base, etimsTestMode: true, etimsControlNumber: 'ETM1793816051123' });
    for (const text of [f.escpos, f.html, f.epson, f.star]) {
      expect(text).not.toContain('VERIFIED');
      expect(text).not.toContain('ETM1793816051123');
      expect(text).toContain('KRA eTIMS: TEST MODE');
    }
    expect(f.html).not.toContain('<svg');
    expect(Buffer.from(receiptEscPos({ ...base, etimsTestMode: true }, { paperWidth: 58 })).includes(Buffer.from([0x1d, 0x28, 0x6b]))).toBe(false);
  });

  it('a voided receipt never reads as KRA verified and has no QR', () => {
    const f = allFormats({ ...base, voided: true });
    for (const text of [f.escpos, f.html, f.epson, f.star]) {
      expect(text).not.toContain('VERIFIED');
      expect(text).toContain('Original control No: CU-0001234');
    }
    expect(f.html).not.toContain('<svg');
  });

  it('an original, paid receipt carries none of the warning banners', () => {
    const f = allFormats(base);
    for (const marker of ['VOID', 'CREDIT SALE', 'PENDING KRA', 'COPY', 'TEST MODE', 'OFFLINE SALE']) {
      expect(f.escpos).not.toContain(marker);
      expect(f.html).not.toContain(marker);
    }
  });

  it('prints eTIMS control number, buyer PIN, service charge and tip on every format', () => {
    const f = allFormats({ ...base, customerKraPin: 'A123456789Z', serviceChargeCents: 5000, tipCents: 2000 });
    for (const text of [f.escpos, f.html, f.epson, f.star]) {
      expect(text).toContain('CU-0001234');
      expect(text).toContain('A123456789Z');
      expect(text).toContain('Service (10%)');
      expect(text).toContain('Tip/Gratuity');
    }
  });
});

describe('ESC/POS output', () => {
  it('never splits a byte: the drawer pulse and every command byte survive intact', () => {
    const bytes = receiptEscPos(base, { paperWidth: 58, enableCashDrawer: true });
    expect(Array.from(bytes.slice(0, 5))).toEqual(Array.from(DRAWER_PULSE));
    expect(bytes[4]).toBe(0xfa);
    expect(bytes.length).toBeGreaterThan(200);
  });

  it('opens the drawer only for an original cash sale', () => {
    const open = (patch: Partial<ReceiptDocument>, enable = true) =>
      receiptEscPos({ ...base, ...patch }, { paperWidth: 58, enableCashDrawer: enable })[0] === 0x1b &&
      receiptEscPos({ ...base, ...patch }, { paperWidth: 58, enableCashDrawer: enable })[1] === 0x70;
    expect(open({})).toBe(true);
    expect(open({}, false)).toBe(false);
    expect(open({ payments: [{ method: 'MPESA', amountCents: 95000 }] })).toBe(false);
    expect(open({ copyNumber: 1 })).toBe(false);
    expect(open({ voided: true })).toBe(false);
  });

  it('receiptOpensDrawer agrees with the bytes that are printed', () => {
    for (const patch of [{}, { copyNumber: 1 }, { voided: true }, { payments: [{ method: 'MPESA', amountCents: 95000 }] }] as Array<Partial<ReceiptDocument>>) {
      const doc = { ...base, ...patch };
      const pulses = receiptEscPos(doc, { paperWidth: 58, enableCashDrawer: true })[1] === 0x70;
      expect(receiptOpensDrawer(doc, true)).toBe(pulses);
    }
    expect(receiptOpensDrawer(base, false)).toBe(false);
  });

  it('keeps every line within the paper width and wraps long item names', () => {
    for (const w of [58, 80] as const) {
      const cols = PAPER_COLUMNS[w];
      const lines = printedLines(receiptEscPos(base, { paperWidth: w }));
      // The 2-column-per-character "TOTAL" line is double height only, so it is still `cols` wide.
      for (const l of lines) expect(l.length).toBeLessThanOrEqual(cols);
      expect(lines.some((l) => l.includes('Cappuccino large'))).toBe(true);
    }
  });

  it('puts the KRA QR in the printer\'s native QR commands (GS ( k) with the right length', () => {
    const bytes = receiptEscPos(base, { paperWidth: 58 });
    const data = Buffer.from(base.kraQRCode!, 'latin1');
    const store = Buffer.from([0x1d, 0x28, 0x6b, (data.length + 3) & 0xff, (data.length + 3) >> 8, 49, 80, 48]);
    expect(Buffer.from(bytes).indexOf(Buffer.concat([store, data]))).toBeGreaterThan(-1);
  });

  it('omits the QR block when there is no eTIMS data', () => {
    const bytes = receiptEscPos({ ...base, kraQRCode: undefined, etimsSubmitted: undefined, etimsControlNumber: undefined }, { paperWidth: 58 });
    expect(Buffer.from(bytes).includes(Buffer.from([0x1d, 0x28, 0x6b]))).toBe(false);
  });

  it('keeps non-ASCII customer text out of the byte stream', () => {
    const bytes = receiptEscPos({ ...base, customerName: 'Zoë – 日本' }, { paperWidth: 58 });
    expect(printedLines(bytes).join('\n')).toContain('Customer:');
    expect(printedLines(bytes).join('\n')).toContain('Zoe - ??');
  });
});

describe('HTML output', () => {
  it('contains no script and no network reference, so it prints offline', () => {
    const html = receiptHtml(base, { paperWidth: 80 });
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/(src|href)=["']https?:/i);
    expect(html).toContain('<svg');
    expect(html).toContain('size: 80mm auto');
  });

  it('escapes user text', () => {
    const html = receiptHtml({ ...base, customerName: '<img src=x onerror=alert(1)>' }, { paperWidth: 80 });
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
  });
});

describe('QR code', () => {
  it('produces a square module matrix with the three finder patterns', () => {
    const m = qrMatrix('https://etims.kra.go.ke/verify?x=ABC123');
    expect(m.length).toBeGreaterThanOrEqual(21);
    expect(m.every((r) => r.length === m.length)).toBe(true);
    expect(m[0].slice(0, 7).every(Boolean)).toBe(true);                 // top-left finder, top row
    expect(m[0].slice(-7).every(Boolean)).toBe(true);                   // top-right finder
    expect(m[m.length - 1].slice(0, 7).every(Boolean)).toBe(true);      // bottom-left finder
  });

  it('renders an inline svg of the requested size', () => {
    expect(qrSvg('hello', 110)).toMatch(/^<svg[^>]*width="110"[^>]*height="110"/);
  });
});

describe('payment grouping', () => {
  it('collapses M-Pesa variants and keeps the lines', () => {
    const groups = groupPayments([
      { method: 'MPESA', amountCents: 1000, reference: 'QWE1' },
      { method: 'M-PESA', amountCents: 2000 },
      { method: 'CASH', amountCents: 500 },
    ]);
    expect(groups.map((g) => [g.label, g.totalCents, g.isGroup])).toEqual([['M-Pesa', 3000, true], ['Cash', 500, false]]);
  });
});

describe('kitchen ticket and bill', () => {
  const kot: KotDocument = {
    kotNumber: '42',
    tableNumber: '7',
    orderType: 'ADDITION',
    createdAt: '2026-10-27T10:15:00',
    waiterName: 'Joy',
    items: [{ name: 'Nyama Choma', quantity: 2, specialInstructions: 'well done', modifiers: ['extra kachumbari'] }],
  };

  it('prints the same content on every format', () => {
    const o = { paperWidth: 80 as const };
    const out = [printedLines(kotEscPos(kot, o)).join('\n'), kotHtml(kot, o), kotEpsonXml(kot, o), kotStarXml(kot, o)];
    for (const text of out) {
      expect(text).toContain('KITCHEN ORDER');
      expect(text).toContain('T7');
      expect(text).toContain('+ ADDITION');
      expect(text).toContain('Nyama Choma');
      expect(text).toContain('well done');
      expect(text).toContain('extra kachumbari');
    }
  });

  it('a cancellation slip says CANCEL and DO NOT MAKE on every format', () => {
    const o = { paperWidth: 80 as const };
    const slip: KotDocument = { ...kot, orderType: 'VOID', items: [{ name: 'Ugali', quantity: 1 }] };
    const out = [printedLines(kotEscPos(slip, o)).join('\n'), kotHtml(slip, o), kotEpsonXml(slip, o), kotStarXml(slip, o)];
    for (const text of out) {
      expect(text).toContain('DO NOT MAKE');
      expect(text).toContain('CANCEL 1x Ugali');
      expect(text).not.toContain('NEW ORDER');
    }
  });

  it('bill shows tax only when the business charged it', () => {
    const bill: BillDocument = {
      tableNumber: '3', businessName: 'Premier', date: '2026-10-27T10:15:00', subtotalCents: 11600, totalCents: 11600,
      items: [{ name: 'Tea', quantity: 1, unitPriceCents: 11600, totalCents: 11600 }],
    };
    const o = { paperWidth: 58 as const };
    expect(printedLines(billEscPos(bill, o)).join('\n')).not.toMatch(/VAT|TOT \(/);
    expect(billHtml({ ...bill, vatCents: 1600 }, o)).toContain('VAT (16%) included');
    expect(billHtml({ ...bill, totCents: 348 }, o)).toContain('TOT (3%) included');
  });
});

describe('kitchen routing', () => {
  it('an explicit station always wins over the name', () => {
    expect(resolveStation({ name: 'Watermelon juice', station: 'KOT_DESSERTS' })).toBe('KOT_DESSERTS');
  });

  it('understands the station names stored on items as well as printer handles', () => {
    expect(resolveStation({ name: 'Anything', station: 'BAR' })).toBe('KOT_DRINKS');
    expect(resolveStation({ name: 'Anything', station: 'dessert' })).toBe('KOT_DESSERTS');
    expect(resolveStation({ name: 'Anything', station: 'KITCHEN' })).toBe('KOT_FOOD');
  });

  it('ignores a malformed station and falls back to the guess', () => {
    expect(resolveStation({ name: 'Beer', station: 'bar; drop table' })).toBe('KOT_DRINKS');
  });

  it('matches whole words, so watermelon is not a drink', () => {
    expect(resolveStation({ name: 'Water 500ml' })).toBe('KOT_DRINKS');
    expect(resolveStation({ name: 'Watermelon slices' })).toBe('KOT_FOOD');
  });

  it('can reach the dessert station (it used to be shadowed by the food list)', () => {
    expect(resolveStation({ name: 'Chocolate cake' })).toBe('KOT_DESSERTS');
    expect(resolveStation({ name: 'Anything', category: 'Desserts' })).toBe('KOT_DESSERTS');
    expect(resolveStation({ name: 'Vanilla ice cream' })).toBe('KOT_DESSERTS');
  });

  it('defaults to the food station', () => {
    expect(resolveStation({ name: 'Mystery special' })).toBe('KOT_FOOD');
  });

  it('splits a ticket by station and attaches the printer that handles each', () => {
    const kitchen = { id: 'k', connectionType: 'NETWORK', connectionDetails: '192.168.1.5', handles: '["KOT_FOOD"]' };
    const bar = { id: 'b', connectionType: 'NETWORK', connectionDetails: '192.168.1.6', handles: ['KOT_DRINKS'] };
    const routes = routeKotItems(
      [{ name: 'Burger', quantity: 1 }, { name: 'Beer', quantity: 2 }, { name: 'Cake', quantity: 1 }],
      [kitchen, bar],
    );
    const by = Object.fromEntries(routes.map((r) => [r.station, r]));
    expect(by.KOT_FOOD.printer?.id).toBe('k');
    expect(by.KOT_DRINKS.printer?.id).toBe('b');
    expect(by.KOT_DESSERTS.printer).toBeNull();
  });
});

describe('printer diagnostic page', () => {
  it('the column ruler is exactly one line wide with both edge marks', () => {
    for (const cols of [32, 48]) {
      const r = columnRuler(cols);
      expect(r).toHaveLength(cols);
      expect(r[0]).toBe('|');
      expect(r[cols - 1]).toBe('|');
    }
  });

  it('prints on both paper widths without wrapping the ruler, with the QR, the cut and plain-ASCII text', () => {
    for (const w of [58, 80] as const) {
      const bytes = diagnosticEscPos({ paperWidth: w });
      const lines = printedLines(bytes);
      const cols = PAPER_COLUMNS[w];
      for (const l of lines) expect(l.length).toBeLessThanOrEqual(cols);
      expect(lines).toContain(columnRuler(cols));
      expect(lines.join('\n')).toContain('Cafe - Naive "quotes" x 3 EUR5');
      expect(Buffer.from(bytes).includes(Buffer.from([0x1d, 0x28, 0x6b]))).toBe(true); // native QR
      expect(Array.from(bytes.slice(-4))).toEqual([0x1d, 0x56, 0x41, 0x00]);            // cut
    }
  });

  it('is available as HTML, Epson and Star output too', () => {
    const o = { paperWidth: 80 as const };
    expect(diagnosticHtml(o)).toContain('PRINTER TEST');
    expect(diagnosticHtml(o)).toContain('<svg');
    expect(diagnosticEpsonXml(o)).toContain('PRINTER TEST');
    expect(diagnosticStarXml(o)).toContain('PRINTER TEST');
  });
});

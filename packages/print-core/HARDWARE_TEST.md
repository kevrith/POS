# Real-printer test

Everything in `@pos/print-core` is tested with fakes: the tests prove the bytes and the text, not what a printer
does with them. Run this once for every printer MODEL you intend to support, and write the result in the table at
the bottom. It takes about 20 minutes per printer. You need the printer, a roll of paper, a phone, a pencil and,
for the drawer step, a cash drawer connected to the printer's RJ11 port.

## Before you start

1. Settings -> Printers: choose the printer, and set the **paper width** (58 or 80 mm) to match the roll.
2. The desktop app, Chrome or Edge is needed for USB and Bluetooth from the web till. LAN printers need a fixed IP
   address (for example 192.168.1.50, port 9100). The mobile app does Bluetooth (Android) and Wi-Fi/LAN.

## 1. Full test page (Settings -> Printers -> "Print full test page", also in the mobile app)

The page numbers its sections. Check each against the paper:

| Section | It passes when |
|---|---|
| Header | "PRINTER TEST" is clearly bold/large and centered |
| 1. Columns | **both `\|` marks are visible** and the ruler is ONE line. A missing mark or a wrapped ruler means the paper width setting is wrong (or the printer's printable area is narrower than its paper) |
| 2. Alignment | every amount ends at the same right edge; the long item name is cut, not the amount; TOTAL is double height |
| 3. Styles | bold is heavier, small is smaller, large is taller, XL is double width and height; Left / Center / Right line up as named |
| 4. Wrapping | words wrap between words; the very long word breaks at the line edge |
| 5. Characters | letters, digits and symbols are correct; the line with accents reads `Cafe - Naive "quotes" x 3 EUR5` (no boxes, no `?` runs) |
| 6. Banners | both lines print bold and centered |
| 7. QR | a phone camera reads it and offers the KRA verify address. Try at arm's length. If it will not scan, note the printer model: the QR cell size may need to be larger |
| End | the paper is **cut** (or the printer feeds enough to tear). Text must not be cut through |

## 2. Cash drawer (Settings -> Printers -> "Test cash drawer")

The drawer opens once. It is logged as a TEST, so it does not appear as a hand-opened drawer in the print audit.
If nothing happens: check the RJ11 cable, the printer's DIP switch or driver setting for the drawer, and try the
other pin. The pulse sent is `ESC p 0 25 250` (pin 2). Some drawers need pin 5 (`ESC p 1 25 250`).

## 3. A real receipt, kitchen ticket and reprint

1. Make a small cash sale with auto-print on. Expect: the receipt prints, **the drawer opens**, the cut happens.
2. Press Print again (or reprint from Sales). Expect: `COPY 1 - NOT THE ORIGINAL` at the top and **the drawer
   stays shut**.
3. Send a kitchen ticket from the restaurant till to the kitchen printer. Expect table number in large type, items
   in large type, notes and modifiers indented.
4. Unplug the LAN printer and send another ticket. Expect: a toast saying it is queued, not an error dialog;
   plug it back in and it prints within about 15 seconds (this needs a print station, see the web README).
5. A sale in eTIMS sandbox must say `TEST MODE - NOT A TAX INVOICE` and have no QR.

## Report

Copy this table into the issue or message for each printer. "Fail" needs a photo of the paper.

| Printer model | Connection | Paper | Columns | Align | Styles | Wrap | Chars | QR scans | Cut | Drawer | Receipt+copy | KOT | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| | USB / BT / LAN / installed | 58 / 80 | | | | | | | | | | | |

Most likely findings and the fix to look for:

- **Ruler wraps or a `|` is missing**: wrong paper width, or the printer's margin is wide. Adjust the width setting; if a
  printer needs 42 / 64 columns (font B models), tell us: columns are fixed at 32 / 48 in `PAPER_COLUMNS`.
- **Accents print as wrong symbols**: expected for anything the page does not list; names are reduced to plain ASCII on purpose.
- **QR too small or will not scan**: raise the cell size in `escpos.ts` (`qrCommand(..., 4)` -> 5 or 6).
- **Large text overflows**: the printer's double-width mode halves the columns; the layout accounts for this, so report the model.
- **Bluetooth prints garbage or stops half way**: reduce the chunk size/delay (`BT_CHUNK` in the mobile app, `chunkBytes(...,100)` in the web).
- **Cut does not happen**: some printers have no cutter; others need `GS V 66 0` instead of `GS V 65 0`.

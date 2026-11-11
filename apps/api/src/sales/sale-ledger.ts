import type { LedgerService } from '../ledger/ledger.service';

/**
 * Kenyan retail chart-of-accounts posting for one sale. Shared by the till's sales and by direct sales (fuel and
 * the other verticals), so every sale lands in the books the same way.
 *
 *   Dr  Cash / M-Pesa / Bank / Accounts Receivable   (what was tendered)
 *     Cr  Sales Revenue                              (net of tax & service charge)
 *     Cr  VAT / Turnover Tax Payable                 (tax extracted from the inclusive price)
 *     Cr  Service Charge Income, Tips Payable        (when charged)
 */
export interface SaleJournalInput {
  businessId: string;
  storeId: string;
  receiptNumber: string;
  isCredit: boolean;
  totalCents: number;
  vatCents: number;
  totCents: number;
  serviceChargeCents: number;
  tipCents: number;
  payments: Array<{ method: string; amountCents: number }>;
}

type JournalLine = { accountCode: string; accountName: string; debitCents: number; creditCents: number };

/** The account a tender method settles into. */
export function tenderAccount(method: string): { code: string; name: string } {
  // A deposit already held for the guest is not new money: using it clears what the hotel owes the guest.
  if (method === 'DEPOSIT') return { code: '2300', name: 'Guest Deposits' };
  // Charged to a guest's room: nothing is received until the guest settles the folio, so it is owed to the business.
  if (method === 'ROOM_CHARGE') return { code: '1200', name: 'Accounts Receivable' };
  // An insurer's share of a prescription: owed to the pharmacy until the claim is paid.
  if (method === 'INSURANCE') return { code: '1200', name: 'Accounts Receivable' };
  if (method === 'CASH') return { code: '1000', name: 'Cash on Hand' };
  if (method.startsWith('MPESA')) return { code: '1010', name: 'M-Pesa Control' };
  if (method === 'CARD') return { code: '1020', name: 'Card Settlement' };
  return { code: '1030', name: 'Bank / Other Receipts' };
}

export function buildSaleJournalLines(input: SaleJournalInput): JournalLine[] {
  const lines: JournalLine[] = [];

  const debit = (accountCode: string, accountName: string, amount: number) => {
    if (amount > 0) lines.push({ accountCode, accountName, debitCents: amount, creditCents: 0 });
  };
  const credit = (accountCode: string, accountName: string, amount: number) => {
    if (amount > 0) lines.push({ accountCode, accountName, debitCents: 0, creditCents: amount });
  };

  if (input.isCredit) {
    debit('1200', 'Accounts Receivable', input.totalCents);
  } else {
    const tendered = new Map<string, number>();
    for (const p of input.payments) {
      tendered.set(p.method, (tendered.get(p.method) ?? 0) + p.amountCents);
    }
    // Over-tender is change handed back, so never debit more than the sale total.
    const totalTendered = [...tendered.values()].reduce((s, v) => s + v, 0);
    const scale = totalTendered > input.totalCents && totalTendered > 0
      ? input.totalCents / totalTendered
      : 1;

    for (const [method, amount] of tendered) {
      const acct = tenderAccount(method);
      debit(acct.code, acct.name, Math.round(amount * scale));
    }
  }

  credit('2100', 'VAT Payable', input.vatCents);
  credit('2110', 'Turnover Tax Payable', input.totCents);
  credit('4100', 'Service Charge Income', input.serviceChargeCents);
  credit('2200', 'Tips Payable', input.tipCents);

  const revenue =
    input.totalCents -
    input.vatCents -
    input.totCents -
    input.serviceChargeCents -
    input.tipCents;
  credit('4000', 'Sales Revenue', revenue);

  const debits = lines.reduce((s, l) => s + l.debitCents, 0);
  const credits = lines.reduce((s, l) => s + l.creditCents, 0);
  // Rounding from tax extraction can leave a cent; park it so the entry balances.
  if (debits !== credits) {
    const diff = debits - credits;
    if (diff > 0) credit('4900', 'Rounding Difference', diff);
    else debit('4900', 'Rounding Difference', -diff);
  }
  return lines;
}

export async function postSaleJournal(ledger: Pick<LedgerService, 'autoPost'>, input: SaleJournalInput): Promise<void> {
  const lines = buildSaleJournalLines(input);
  if (lines.length === 0) return;
  await ledger.autoPost({
    businessId: input.businessId,
    storeId: input.storeId,
    description: `Sale ${input.receiptNumber}`,
    reference: input.receiptNumber,
    sourceType: 'SALE',
    lines,
  });
}

/** A customer paying down what they owe: money in, receivable cleared. */
export function buildSettlementJournalLines(method: string, amountCents: number): JournalLine[] {
  if (!(amountCents > 0)) return [];
  const acct = tenderAccount(method);
  return [
    { accountCode: acct.code, accountName: acct.name, debitCents: amountCents, creditCents: 0 },
    { accountCode: '1200', accountName: 'Accounts Receivable', debitCents: 0, creditCents: amountCents },
  ];
}

export async function postSettlementJournal(
  ledger: Pick<LedgerService, 'autoPost'>,
  input: { businessId: string; storeId?: string; description: string; reference: string; sourceType: string; method: string; amountCents: number },
): Promise<void> {
  const lines = buildSettlementJournalLines(input.method, input.amountCents);
  if (lines.length === 0) return;
  await ledger.autoPost({
    businessId: input.businessId,
    storeId: input.storeId,
    description: input.description,
    reference: input.reference,
    sourceType: input.sourceType,
    lines,
  });
}

/**
 * A guest deposit moving. Taken: money in, and the hotel owes it to the guest (a liability, not revenue). Refunded:
 * the liability goes and money goes out. Forfeited (a cancelled booking that loses its deposit): the liability
 * becomes income, with no money moving.
 */
export type DepositMove = 'RECEIVED' | 'REFUNDED' | 'FORFEITED';

export function buildDepositJournalLines(move: DepositMove, method: string, amountCents: number): JournalLine[] {
  if (!(amountCents > 0)) return [];
  const tender = tenderAccount(method);
  const owed = { accountCode: '2300', accountName: 'Guest Deposits' };
  if (move === 'RECEIVED') return [
    { accountCode: tender.code, accountName: tender.name, debitCents: amountCents, creditCents: 0 },
    { ...owed, debitCents: 0, creditCents: amountCents },
  ];
  if (move === 'REFUNDED') return [
    { ...owed, debitCents: amountCents, creditCents: 0 },
    { accountCode: tender.code, accountName: tender.name, debitCents: 0, creditCents: amountCents },
  ];
  return [
    { ...owed, debitCents: amountCents, creditCents: 0 },
    { accountCode: '4300', accountName: 'Forfeited Deposits', debitCents: 0, creditCents: amountCents },
  ];
}

export async function postDepositJournal(
  ledger: Pick<LedgerService, 'autoPost'>,
  input: { businessId: string; storeId?: string; description: string; reference: string; move: DepositMove; method: string; amountCents: number; sourceType?: string },
): Promise<void> {
  const lines = buildDepositJournalLines(input.move, input.method, input.amountCents);
  if (lines.length === 0) return;
  await ledger.autoPost({
    businessId: input.businessId,
    storeId: input.storeId,
    description: input.description,
    reference: input.reference,
    sourceType: input.sourceType ?? 'HOTEL_DEPOSIT',
    lines,
  });
}

/**
 * An insurance claim closing. The insurer's share of a fill sits in Accounts Receivable from the sale. Paid: the money
 * arrives in the bank and the receivable clears, with any shortfall written off and any overpayment kept as income
 * (the money did arrive). Rejected: the whole amount is written off, since the pharmacy will not be paid it.
 */
export function buildClaimJournalLines(outcome: 'PAID' | 'REJECTED', billedCents: number, paidCents: number): JournalLine[] {
  const lines: JournalLine[] = [];
  const paid = outcome === 'PAID' ? Math.max(0, paidCents) : 0;
  const writeOff = Math.max(0, billedCents - paid);
  const overpaid = Math.max(0, paid - billedCents);
  if (paid > 0) lines.push({ accountCode: '1030', accountName: 'Bank / Other Receipts', debitCents: paid, creditCents: 0 });
  if (writeOff > 0) lines.push({ accountCode: '6900', accountName: 'Insurance Claim Write-offs', debitCents: writeOff, creditCents: 0 });
  if (billedCents > 0) lines.push({ accountCode: '1200', accountName: 'Accounts Receivable', debitCents: 0, creditCents: billedCents });
  if (overpaid > 0) lines.push({ accountCode: '4400', accountName: 'Claim Overpayments', debitCents: 0, creditCents: overpaid });
  return lines;
}

/**
 * The opposite of a journal, in whole or in part: a voided sale takes back its revenue, tax and tender. For a part
 * (a line voided) each line is scaled and the rounding difference put on the largest line, so the entry still balances.
 */
export function reverseJournalLines(lines: JournalLine[], fraction = 1): JournalLine[] {
  const f = Math.min(1, Math.max(0, fraction));
  const out = lines
    .map((l) => ({ accountCode: l.accountCode, accountName: l.accountName, debitCents: Math.round(l.creditCents * f), creditCents: Math.round(l.debitCents * f) }))
    .filter((l) => l.debitCents > 0 || l.creditCents > 0);
  const debits = out.reduce((sum, l) => sum + l.debitCents, 0);
  const credits = out.reduce((sum, l) => sum + l.creditCents, 0);
  if (debits !== credits && out.length > 0) {
    const side = debits > credits ? 'creditCents' : 'debitCents';
    const target = [...out].filter((l) => l[side] > 0).sort((a, b) => b[side] - a[side])[0] ?? out[0];
    target[side] += Math.abs(debits - credits);
  }
  return out;
}

/**
 * Opening balances: what was already owed when a business switched its verticals onto the sales pipeline (or the
 * difference since it last was). The other side is Opening Balance Equity, since the original takings were booked (or
 * not) before this. A negative amount is the same entry the other way round: something was paid off while the pipeline
 * was off.
 */
export function buildOpeningLines(kind: 'GUEST_DEPOSITS' | 'RECEIVABLE', amountCents: number): JournalLine[] {
  if (!amountCents) return [];
  const amount = Math.abs(amountCents);
  const equity = { accountCode: '3900', accountName: 'Opening Balance Equity' };
  const account = kind === 'GUEST_DEPOSITS' ? { accountCode: '2300', accountName: 'Guest Deposits' } : { accountCode: '1200', accountName: 'Accounts Receivable' };
  // A deposit is a liability (credit), a receivable an asset (debit).
  const accountSide = kind === 'GUEST_DEPOSITS' ? 'creditCents' : 'debitCents';
  const equitySide = accountSide === 'creditCents' ? 'debitCents' : 'creditCents';
  const forward = amountCents > 0;
  const lineFor = (acct: { accountCode: string; accountName: string }, side: 'debitCents' | 'creditCents') => {
    const flipped = !forward ? (side === 'debitCents' ? 'creditCents' : 'debitCents') : side;
    return { ...acct, debitCents: flipped === 'debitCents' ? amount : 0, creditCents: flipped === 'creditCents' ? amount : 0 };
  };
  return [lineFor(accountSide === 'debitCents' ? account : equity, 'debitCents'), lineFor(accountSide === 'debitCents' ? equity : account, 'creditCents')];
}

/**
 * A hand-raised insurance claim paid when no sale (and no opening balance) ever put it in receivables: the money that
 * arrived has nothing to clear, so it is income, rather than driving receivables negative or going unrecorded.
 */
export function buildUnmatchedClaimReceiptLines(paidCents: number): JournalLine[] {
  if (!(paidCents > 0)) return [];
  return [
    { accountCode: '1030', accountName: 'Bank / Other Receipts', debitCents: paidCents, creditCents: 0 },
    { accountCode: '4450', accountName: 'Insurance Claim Receipts', debitCents: 0, creditCents: paidCents },
  ];
}

/**
 * A tip taken with a payment: the money arrives in whatever it was paid by, and is owed to the staff, not earned by the
 * business. Kept apart from the sale, so the tax invoice sent to KRA is exactly what was supplied.
 */
export function buildTipJournalLines(method: string, amountCents: number): JournalLine[] {
  if (!(amountCents > 0)) return [];
  const acct = tenderAccount(method);
  return [
    { accountCode: acct.code, accountName: acct.name, debitCents: amountCents, creditCents: 0 },
    { accountCode: '2200', accountName: 'Tips Payable', debitCents: 0, creditCents: amountCents },
  ];
}

export async function postTipJournal(
  ledger: Pick<LedgerService, 'autoPost'>,
  input: { businessId: string; storeId?: string; description: string; reference: string; method: string; amountCents: number; sourceType?: string },
): Promise<void> {
  const lines = buildTipJournalLines(input.method, input.amountCents);
  if (lines.length === 0) return;
  await ledger.autoPost({
    businessId: input.businessId,
    storeId: input.storeId,
    description: input.description,
    reference: input.reference,
    sourceType: input.sourceType ?? 'TIP',
    lines,
  });
}

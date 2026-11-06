import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup as render } from 'react-dom/server';
import { Banknote, Smartphone, CreditCard, LayoutGrid, Building2, Gift } from 'lucide-react';
import { PaymentMethodPicker, type PickerGroup } from '../PaymentMethodPicker';

type Id = 'CASH' | 'STK' | 'PAYBILL' | 'CARD' | 'BANK' | 'GIFT';
const groups: Array<PickerGroup<Id>> = [
  { label: 'Cash', Icon: Banknote, methods: [{ id: 'CASH', label: 'Cash', Icon: Banknote }] },
  { label: 'M-Pesa', Icon: Smartphone, methods: [{ id: 'STK', label: 'STK Push', Icon: Smartphone }, { id: 'PAYBILL', label: 'Paybill', Icon: Smartphone }] },
  { label: 'Card', Icon: CreditCard, methods: [{ id: 'CARD', label: 'Paystack', Icon: CreditCard }] },
  { label: 'Other', Icon: LayoutGrid, methods: [{ id: 'BANK', label: 'Bank Transfer', Icon: Building2 }, { id: 'GIFT', label: 'Gift Card', Icon: Gift }] },
];

describe('PaymentMethodPicker', () => {
  it('shows one large tile per kind of payment, with exactly one selected', () => {
    const html = render(<PaymentMethodPicker groups={groups} value="CASH" onChange={() => {}} />);
    expect(html).toContain('aria-label="Payment type"');
    for (const g of ['Cash', 'M-Pesa', 'Card', 'Other']) expect(html).toContain(`>${g}</span>`);
    expect(html.match(/aria-selected="true"/g)).toHaveLength(1);
  });

  it('every target is at least 44px tall, for fingers', () => {
    const html = render(<PaymentMethodPicker groups={groups} value="STK" onChange={() => {}} />);
    expect(html).toContain('min-h-[56px]');
    expect(html).toContain('h-11'); // the option chips
  });

  it('a kind with only one way shows no second row', () => {
    const html = render(<PaymentMethodPicker groups={groups} value="CASH" onChange={() => {}} />);
    expect(html).not.toContain('options"');
  });

  it('a kind with several ways lists each by its FULL name (these used to collide in one cramped row)', () => {
    const html = render(<PaymentMethodPicker groups={groups} value="BANK" onChange={() => {}} />);
    expect(html).toContain('aria-label="Other options"');
    expect(html).toContain('Bank Transfer');
    expect(html).toContain('Gift Card');
    expect(html).toContain('flex-wrap'); // wraps onto a second line instead of squeezing
  });

  it('selecting a way inside a kind keeps that kind selected', () => {
    const html = render(<PaymentMethodPicker groups={groups} value="PAYBILL" onChange={() => {}} />);
    expect(html).toContain('aria-label="M-Pesa options"');
    expect(html.match(/aria-selected="true"/g)).toHaveLength(2); // the M-Pesa tile and the Paybill chip
  });
});

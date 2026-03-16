import { PayrollService } from './payroll.service';

// ─── Helper to create a minimal service instance without Prisma ──────────────
// We only test the pure calculation method here; DB interactions are tested e2e.
function makeService(): PayrollService {
  return new PayrollService(null as any);
}

describe('PayrollService.calculatePayslip', () => {
  let svc: PayrollService;
  beforeEach(() => { svc = makeService(); });

  // ─── Zero salary ───────────────────────────────────────────────────────────

  it('returns zeros for zero salary', () => {
    const result = svc.calculatePayslip({ salaryBaseCents: 0, housingCents: 0, transportCents: 0, commissionCents: 0 });
    expect(result.grossPay).toBe(0);
    expect(result.payeAmount).toBe(0);
    expect(result.nhifAmount).toBe(15000); // minimum NHIF bracket (≤ 5,999 KES = 150 KES)
    expect(result.nssf1Amount).toBe(0);
    expect(result.nssf2Amount).toBe(0);
    expect(result.housingLevyAmount).toBe(0);
    expect(result.netPay).toBe(0); // clamped to 0
  });

  // ─── PAYE personal relief absorbs first bracket ────────────────────────────

  it('PAYE is zero when gross ≤ KES 24,000 (fully absorbed by personal relief)', () => {
    // KES 24,000 gross — tax = 24000*0.10 = 2400, relief = 2400 → PAYE = 0
    const result = svc.calculatePayslip({
      salaryBaseCents: 2_400_000, // KES 24,000
      housingCents: 0,
      transportCents: 0,
      commissionCents: 0,
    });
    expect(result.payeAmount).toBe(0);
  });

  it('PAYE is non-zero when gross exceeds KES 24,000 (enters second bracket)', () => {
    // KES 30,000 gross: tax = 2400 + (30000-24000)*0.25 = 2400+1500=3900, relief=2400, PAYE=1500
    const result = svc.calculatePayslip({
      salaryBaseCents: 3_000_000, // KES 30,000
      housingCents: 0,
      transportCents: 0,
      commissionCents: 0,
    });
    expect(result.payeAmount).toBe(150_000); // KES 1,500 in cents
  });

  it('PAYE uses 30% bracket above KES 32,333', () => {
    // KES 50,000: tax = 2400 + (32333-24000)*0.25 + (50000-32333)*0.30 - 2400
    //           = 2400 + 2083.25 + 5300.1 - 2400 = 7383.35 → 738335 cents
    const result = svc.calculatePayslip({
      salaryBaseCents: 5_000_000,
      housingCents: 0,
      transportCents: 0,
      commissionCents: 0,
    });
    expect(result.payeAmount).toBeGreaterThan(0);
    // Spot-check: gross=50000, paye should be between KES 5,000 and KES 10,000
    expect(result.payeAmount).toBeGreaterThan(500_000);
    expect(result.payeAmount).toBeLessThan(1_000_000);
  });

  it('PAYE uses 32.5% bracket above KES 500,000', () => {
    const result = svc.calculatePayslip({
      salaryBaseCents: 60_000_000, // KES 600,000
      housingCents: 0,
      transportCents: 0,
      commissionCents: 0,
    });
    // Bracket 4 (32.5%) kicks in from KES 500,001
    expect(result.payeAmount).toBeGreaterThan(10_000_000); // KES 100,000+
  });

  it('PAYE uses 35% bracket above KES 800,000', () => {
    const result = svc.calculatePayslip({
      salaryBaseCents: 100_000_000, // KES 1,000,000
      housingCents: 0,
      transportCents: 0,
      commissionCents: 0,
    });
    // Should be taxed at 35% on the portion above KES 800,000
    expect(result.payeAmount).toBeGreaterThan(25_000_000);
  });

  // ─── NHIF tiers ────────────────────────────────────────────────────────────

  // NHIF brackets use strict ≤ comparisons, so boundary values are: 5999, 7999, 11999…
  const nhifCases: [number, number, string][] = [
    [500_000,   15_000, 'KES 5,000 (≤5,999) → KES 150'],
    [700_000,   30_000, 'KES 7,000 (≤7,999) → KES 300'],
    [1_000_000, 40_000, 'KES 10,000 (≤11,999) → KES 400'],
    [1_200_000, 50_000, 'KES 12,000 (≤14,999) → KES 500'],
    [1_500_000, 60_000, 'KES 15,000 (≤19,999) → KES 600'],
    [2_000_000, 75_000, 'KES 20,000 (≤24,999) → KES 750'],
    [10_000_000, 170_000, 'KES 100,000 → KES 1,700 (max)'],
  ];

  test.each(nhifCases)('NHIF: gross %i cents → %i cents (%s)', (grossCents, expectedNhif) => {
    const result = svc.calculatePayslip({
      salaryBaseCents: grossCents,
      housingCents: 0,
      transportCents: 0,
      commissionCents: 0,
    });
    expect(result.nhifAmount).toBe(expectedNhif);
  });

  // ─── NSSF tiers ────────────────────────────────────────────────────────────

  it('NSSF Tier 1 = 6% on LEL (KES 7,000 = KES 420)', () => {
    const result = svc.calculatePayslip({
      salaryBaseCents: 1_000_000, // KES 10,000 — above LEL
      housingCents: 0,
      transportCents: 0,
      commissionCents: 0,
    });
    expect(result.nssf1Amount).toBe(42_000); // 700000 * 0.06 = 42000 cents = KES 420
  });

  it('NSSF Tier 2 = 6% on (gross-LEL) when above LEL, capped at UEL-LEL', () => {
    const result = svc.calculatePayslip({
      salaryBaseCents: 1_000_000, // KES 10,000
      housingCents: 0,
      transportCents: 0,
      commissionCents: 0,
    });
    // tier2Base = (1,000,000 - 700,000) = 300,000 → 300,000 * 0.06 = 18,000
    expect(result.nssf2Amount).toBe(18_000);
  });

  it('NSSF Tier 2 is capped at (UEL - LEL) = KES 29,000 = KES 1,740', () => {
    const result = svc.calculatePayslip({
      salaryBaseCents: 100_000_000, // KES 1,000,000 — well above UEL
      housingCents: 0,
      transportCents: 0,
      commissionCents: 0,
    });
    // max tier2Base = 3,600,000 - 700,000 = 2,900,000 → 2,900,000 * 0.06 = 174,000 cents
    expect(result.nssf2Amount).toBe(174_000);
  });

  it('NSSF Tier 2 = 0 when gross ≤ LEL', () => {
    const result = svc.calculatePayslip({
      salaryBaseCents: 700_000, // exactly LEL
      housingCents: 0,
      transportCents: 0,
      commissionCents: 0,
    });
    expect(result.nssf2Amount).toBe(0);
  });

  // ─── Housing Levy ──────────────────────────────────────────────────────────

  it('Housing levy = 1.5% of gross', () => {
    const result = svc.calculatePayslip({
      salaryBaseCents: 5_000_000, // KES 50,000
      housingCents: 0,
      transportCents: 0,
      commissionCents: 0,
    });
    expect(result.housingLevyAmount).toBe(75_000); // 5,000,000 * 0.015
  });

  // ─── Gross pay includes all allowances ────────────────────────────────────

  it('grossPay = base + housing + transport + commission + overtime', () => {
    const result = svc.calculatePayslip({
      salaryBaseCents: 2_000_000,
      housingCents: 500_000,
      transportCents: 300_000,
      commissionCents: 200_000,
    });
    expect(result.grossPay).toBe(3_000_000);
  });

  // ─── Overtime from hours ───────────────────────────────────────────────────

  it('calculates overtime at 1.5x hourly rate from hours', () => {
    // salary KES 19,200 → hourly = 19200/192 = 100 KES/hr
    // 10 overtime hours → 10 * 100 * 1.5 = 1500 KES = 150,000 cents
    const result = svc.calculatePayslip(
      { salaryBaseCents: 1_920_000, housingCents: 0, transportCents: 0, commissionCents: 0 },
      10,
    );
    expect(result.overtimeCents).toBe(150_000);
    expect(result.overtimeHours).toBe(10);
    expect(result.grossPay).toBe(1_920_000 + 150_000);
  });

  it('pre-supplied overtimeCents takes precedence over hours', () => {
    const result = svc.calculatePayslip(
      {
        salaryBaseCents: 1_920_000,
        housingCents: 0,
        transportCents: 0,
        commissionCents: 0,
        overtimeCents: 200_000, // explicitly provided
      },
      5, // hours arg is ignored when overtimeCents is provided
    );
    expect(result.overtimeCents).toBe(200_000);
  });

  // ─── Net pay is never negative ────────────────────────────────────────────

  it('netPay is clamped to 0 when deductions exceed gross', () => {
    // Very low gross (KES 100) but NHIF is KES 150 → net should be 0, not negative
    const result = svc.calculatePayslip({
      salaryBaseCents: 10_000, // KES 100
      housingCents: 0,
      transportCents: 0,
      commissionCents: 0,
    });
    expect(result.netPay).toBeGreaterThanOrEqual(0);
  });

  // ─── Realistic payslip for a KES 50,000 employee ─────────────────────────

  it('full payslip for KES 50,000 salary is internally consistent', () => {
    const result = svc.calculatePayslip({
      salaryBaseCents: 5_000_000,
      housingCents: 0,
      transportCents: 0,
      commissionCents: 0,
    });

    const totalDeductions = result.payeAmount + result.nhifAmount + result.nssf1Amount + result.nssf2Amount + result.housingLevyAmount;
    expect(result.netPay).toBe(Math.max(0, result.grossPay - totalDeductions));
    expect(result.grossPay).toBe(5_000_000);
    // NHIF for KES 50,000 = KES 1,200 = 120,000 cents (≤ 59,999)
    expect(result.nhifAmount).toBe(120_000);
  });

  // ─── Mid-month proration ──────────────────────────────────────────────────

  it('prorates gross when daysWorked < daysInMonth', () => {
    // Employee joins on the 16th of a 30-day month → 15 days worked
    // Full salary KES 60,000 → prorated = 60,000 * (15/30) = KES 30,000
    const full = svc.calculatePayslip({
      salaryBaseCents: 6_000_000,
      housingCents: 0,
      transportCents: 0,
      commissionCents: 0,
    });
    const prorated = svc.calculatePayslip({
      salaryBaseCents: 6_000_000,
      housingCents: 0,
      transportCents: 0,
      commissionCents: 0,
      daysWorked: 15,
      daysInMonth: 30,
    });
    expect(prorated.grossPay).toBe(3_000_000); // exactly half
    expect(prorated.grossPay).toBeLessThan(full.grossPay);
    // Deductions should also be lower on the prorated gross
    expect(prorated.payeAmount).toBeLessThan(full.payeAmount);
  });

  it('does not prorate when daysWorked equals daysInMonth', () => {
    const full = svc.calculatePayslip({
      salaryBaseCents: 6_000_000,
      housingCents: 0,
      transportCents: 0,
      commissionCents: 0,
    });
    const fullDays = svc.calculatePayslip({
      salaryBaseCents: 6_000_000,
      housingCents: 0,
      transportCents: 0,
      commissionCents: 0,
      daysWorked: 30,
      daysInMonth: 30,
    });
    expect(fullDays.grossPay).toBe(full.grossPay);
  });

  it('proration result is internally consistent (net = gross - deductions)', () => {
    const result = svc.calculatePayslip({
      salaryBaseCents: 5_000_000,
      housingCents: 500_000,
      transportCents: 300_000,
      commissionCents: 0,
      daysWorked: 10,
      daysInMonth: 30,
    });
    const expectedGross = Math.round((5_000_000 + 500_000 + 300_000) * (10 / 30));
    expect(result.grossPay).toBe(expectedGross);
    const totalDeductions = result.payeAmount + result.nhifAmount + result.nssf1Amount + result.nssf2Amount + result.housingLevyAmount;
    expect(result.netPay).toBe(Math.max(0, result.grossPay - totalDeductions));
  });

  // ─── Director NSSF (old Act — flat KES 200/month) ────────────────────────

  it('director pays flat NSSF of KES 200 (20,000 cents), tier2 = 0', () => {
    const result = svc.calculatePayslip({
      salaryBaseCents: 10_000_000, // KES 100,000 — well above UEL
      housingCents: 0,
      transportCents: 0,
      commissionCents: 0,
      isDirector: true,
    });
    expect(result.nssf1Amount).toBe(20_000); // flat KES 200
    expect(result.nssf2Amount).toBe(0);
  });

  it('non-director at same salary uses progressive NSSF (not flat)', () => {
    const result = svc.calculatePayslip({
      salaryBaseCents: 10_000_000,
      housingCents: 0,
      transportCents: 0,
      commissionCents: 0,
      isDirector: false,
    });
    // Tier1 = KES 420, Tier2 = KES 1,740 (both > KES 200)
    expect(result.nssf1Amount).toBe(42_000); // KES 420
    expect(result.nssf2Amount).toBe(174_000); // KES 1,740
  });

  it('director proration combines correctly', () => {
    // Director joins mid-month: 15 of 30 days worked
    const result = svc.calculatePayslip({
      salaryBaseCents: 10_000_000,
      housingCents: 0,
      transportCents: 0,
      commissionCents: 0,
      daysWorked: 15,
      daysInMonth: 30,
      isDirector: true,
    });
    expect(result.grossPay).toBe(5_000_000); // prorated to KES 50,000
    expect(result.nssf1Amount).toBe(20_000);  // flat KES 200 (not prorated — statutory minimum)
    expect(result.nssf2Amount).toBe(0);
  });
});

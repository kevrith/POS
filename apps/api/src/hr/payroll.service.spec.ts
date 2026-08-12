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
    // No pay means no statutory liability at all — not a KES 300 SHIF floor.
    expect(result.shifAmount).toBe(0);
    expect(result.nssf1Amount).toBe(0);
    expect(result.nssf2Amount).toBe(0);
    expect(result.housingLevyAmount).toBe(0);
    expect(result.totalDeductions).toBe(0);
    expect(result.netPay).toBe(0);
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

  it('PAYE is charged on pay after allowable deductions, not on gross', () => {
    // KES 30,000 gross.
    //   SHIF   = 30,000 * 2.75%        =   825
    //   NSSF   = 420 + (23,000 * 6%)   = 1,800
    //   levy   = 30,000 * 1.5%         =   450
    //   taxable = 30,000 - 3,075       = 26,925
    //   tax    = 2,400 + (2,925 * 25%) = 3,131.25 → less relief 2,400 → PAYE 731.25
    const result = svc.calculatePayslip({
      salaryBaseCents: 3_000_000,
      housingCents: 0,
      transportCents: 0,
      commissionCents: 0,
    });
    expect(result.shifAmount).toBe(82_500);
    expect(result.taxablePay).toBe(3_000_000 - result.shifAmount - result.nssf1Amount - result.nssf2Amount - result.housingLevyAmount);
    expect(result.payeAmount).toBe(73_125);
    // Charging PAYE on gross (the old behaviour) would have produced KES 1,500.
    expect(result.payeAmount).toBeLessThan(150_000);
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

  // ─── SHIF (2.75% of gross, min KES 300, no cap) ───────────────────────────

  const shifCases: [number, number, string][] = [
    [500_000,     30_000, 'KES 5,000 → 137.50 raised to the KES 300 floor'],
    [1_000_000,   30_000, 'KES 10,000 → 275 raised to the KES 300 floor'],
    [1_100_000,   30_250, 'KES 11,000 → KES 302.50 (just above the floor)'],
    [5_000_000,  137_500, 'KES 50,000 → KES 1,375'],
    [10_000_000, 275_000, 'KES 100,000 → KES 2,750 (no NHIF-style cap)'],
    [50_000_000, 1_375_000, 'KES 500,000 → KES 13,750 (uncapped)'],
  ];

  test.each(shifCases)('SHIF: gross %i cents → %i cents (%s)', (grossCents, expectedShif) => {
    const result = svc.calculatePayslip({
      salaryBaseCents: grossCents,
      housingCents: 0,
      transportCents: 0,
      commissionCents: 0,
    });
    expect(result.shifAmount).toBe(expectedShif);
  });

  it('SHIF is uncapped, unlike the NHIF bands it replaced', () => {
    const high = svc.calculatePayslip({
      salaryBaseCents: 100_000_000, // KES 1,000,000
      housingCents: 0, transportCents: 0, commissionCents: 0,
    });
    // NHIF capped at KES 1,700; SHIF is a flat 2.75% with no ceiling.
    expect(high.shifAmount).toBe(2_750_000); // KES 27,500
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

  it('deductions are capped at gross so netPay is never negative', () => {
    // Gross KES 100 but the SHIF floor alone is KES 300.
    const result = svc.calculatePayslip({
      salaryBaseCents: 10_000, // KES 100
      housingCents: 0,
      transportCents: 0,
      commissionCents: 0,
    });
    expect(result.netPay).toBe(0);
    expect(result.totalDeductions).toBeLessThanOrEqual(result.grossPay);
    expect(result.deductionsCapped).toBe(true);
  });

  // ─── Realistic payslip for a KES 50,000 employee ─────────────────────────

  it('full payslip for KES 50,000 salary is internally consistent', () => {
    const result = svc.calculatePayslip({
      salaryBaseCents: 5_000_000,
      housingCents: 0,
      transportCents: 0,
      commissionCents: 0,
    });

    const totalDeductions = result.payeAmount + result.shifAmount + result.nssf1Amount + result.nssf2Amount + result.housingLevyAmount;
    expect(result.netPay).toBe(Math.max(0, result.grossPay - totalDeductions));
    expect(result.grossPay).toBe(5_000_000);
    // SHIF for KES 50,000 = 2.75% = KES 1,375
    expect(result.shifAmount).toBe(137_500);
    // NSSF 420 + 1,740 = 2,160; levy 750; SHIF 1,375 → taxable 45,715
    expect(result.taxablePay).toBe(4_571_500);
    // Brackets on 45,715 → 8,497.85 less 2,400 relief = KES 6,097.85
    expect(result.payeAmount).toBe(609_785);
    expect(result.netPay).toBe(3_961_715); // KES 39,617.15
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
    const totalDeductions = result.payeAmount + result.shifAmount + result.nssf1Amount + result.nssf2Amount + result.housingLevyAmount;
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

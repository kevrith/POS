import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { commissionBase, commissionCents as commissionAmount } from './commission-base';

// ─── Kenya statutory constants ────────────────────────────────────────────────
//
// Current as at the Social Health Insurance Act 2023 (SHIF live 1 Oct 2024, replacing
// NHIF) and the Tax Laws (Amendment) Act 2024 (in force 27 Dec 2024), which made SHIF,
// the Affordable Housing Levy and NSSF *allowable deductions* against taxable pay
// rather than tax reliefs.

const PAYE_PERSONAL_RELIEF = 240000; // KES 2,400/month in cents
const NSSF_LEL_CENTS = 700000;       // Lower Earnings Limit: KES 7,000 in cents
const NSSF_UEL_CENTS = 3600000;      // Upper Earnings Limit: KES 36,000 in cents
const NSSF_TIER1_RATE = 0.06;        // 6% employee contribution
const NSSF_TIER2_RATE = 0.06;        // 6% employee contribution
const HOUSING_LEVY_RATE = 0.015;     // 1.5% of gross pay
const SHIF_RATE = 0.0275;            // 2.75% of gross pay
const SHIF_MINIMUM_CENTS = 30000;    // KES 300/month floor

// ─── PAYE Calculation ─────────────────────────────────────────────────────────

/**
 * PAYE on **taxable** pay, not gross. Callers must subtract the allowable
 * deductions (NSSF + SHIF + housing levy) before calling this.
 */
function calcPAYE(taxableCents: number): number {
  // Convert to KES whole units for bracket calculation
  const taxable = Math.max(0, taxableCents) / 100;

  let tax = 0;

  if (taxable <= 24000) {
    tax = taxable * 0.10;
  } else if (taxable <= 32333) {
    tax = 24000 * 0.10 + (taxable - 24000) * 0.25;
  } else if (taxable <= 500000) {
    tax = 24000 * 0.10 + (32333 - 24000) * 0.25 + (taxable - 32333) * 0.30;
  } else if (taxable <= 800000) {
    tax = 24000 * 0.10 + (32333 - 24000) * 0.25 + (500000 - 32333) * 0.30 + (taxable - 500000) * 0.325;
  } else {
    tax = 24000 * 0.10 + (32333 - 24000) * 0.25 + (500000 - 32333) * 0.30 + (800000 - 500000) * 0.325 + (taxable - 800000) * 0.35;
  }

  // Personal relief: KES 2,400/month = 240000 cents
  const personalReliefKes = PAYE_PERSONAL_RELIEF / 100;
  const payeKes = Math.max(0, tax - personalReliefKes);

  return Math.round(payeKes * 100); // return in cents
}

// ─── SHIF Calculation ─────────────────────────────────────────────────────────

/**
 * Social Health Insurance Fund — 2.75% of gross pay, minimum KES 300/month,
 * with no upper cap. Replaced NHIF's income bands (which capped at KES 1,700)
 * from 1 October 2024 under the Social Health Insurance Act 2023.
 */
function calcSHIF(grossCents: number): number {
  if (grossCents <= 0) return 0;
  return Math.max(SHIF_MINIMUM_CENTS, Math.round(grossCents * SHIF_RATE));
}

// ─── NSSF Calculation (new 2024 scheme) ──────────────────────────────────────

function calcNSSF(grossCents: number): { tier1: number; tier2: number } {
  // Tier 1: 6% on LEL (KES 7,000) — flat KES 420
  const tier1 = Math.round(Math.min(grossCents, NSSF_LEL_CENTS) * NSSF_TIER1_RATE);

  // Tier 2: 6% on (gross - LEL), capped at UEL - LEL = KES 29,000
  let tier2 = 0;
  if (grossCents > NSSF_LEL_CENTS) {
    const tier2Base = Math.min(grossCents - NSSF_LEL_CENTS, NSSF_UEL_CENTS - NSSF_LEL_CENTS);
    tier2 = Math.round(tier2Base * NSSF_TIER2_RATE);
  }

  return { tier1, tier2 };
}

// ─── Housing Levy Calculation ─────────────────────────────────────────────────

function calcHousingLevy(grossCents: number): number {
  return Math.round(grossCents * HOUSING_LEVY_RATE);
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface PayslipInput {
  salaryBaseCents: number;
  housingCents: number;
  transportCents: number;
  commissionCents: number;
  overtimeCents?: number;
  /** For mid-month joiners / leavers — prorates all earnings */
  daysWorked?: number;
  /** Calendar days in the pay period month (defaults to 30 if omitted) */
  daysInMonth?: number;
  /** Directors under the old NSSF Act pay a flat KES 200/month (20,000 cents) */
  isDirector?: boolean;
}

interface PayslipResult {
  grossPay: number;
  /** Gross less the allowable deductions (SHIF + NSSF + housing levy). PAYE base. */
  taxablePay: number;
  payeAmount: number;
  /** Social Health Insurance Fund — replaced NHIF on 1 Oct 2024. */
  shifAmount: number;
  nssf1Amount: number;
  nssf2Amount: number;
  housingLevyAmount: number;
  /** Statutory total actually applied (capped at gross pay). */
  totalDeductions: number;
  /** True when statutory deductions exceeded gross and had to be capped. */
  deductionsCapped: boolean;
  netPay: number;
  overtimeCents: number;
  overtimeHours: number;
}

@Injectable()
export class PayrollService {
  constructor(private prisma: PrismaService) {}

  // ─── Core calculation ───────────────────────────────────────────────────────

  calculatePayslip(employee: PayslipInput, overtimeHours = 0): PayslipResult {
    const {
      salaryBaseCents,
      housingCents,
      transportCents,
      commissionCents,
      overtimeCents: overtimeCentsInput,
      daysWorked,
      daysInMonth = 30,
      isDirector = false,
    } = employee;

    // Compute overtime pay from hours if not pre-supplied
    let overtimeCents = overtimeCentsInput ?? 0;
    if (!overtimeCentsInput && overtimeHours > 0 && salaryBaseCents > 0) {
      const STANDARD_HOURS = 192; // 48 hrs/week × 4 weeks
      const hourlyRateCents = salaryBaseCents / STANDARD_HOURS;
      const overtimeRate = 1.5;
      overtimeCents = Math.round(overtimeHours * hourlyRateCents * overtimeRate);
    }

    let grossPay = salaryBaseCents + housingCents + transportCents + commissionCents + overtimeCents;

    // Mid-month proration: scale all earnings by days worked
    if (daysWorked !== undefined && daysWorked < daysInMonth) {
      const ratio = daysWorked / daysInMonth;
      grossPay = Math.round(grossPay * ratio);
      overtimeCents = Math.round(overtimeCents * ratio);
    }

    // No pay, no statutory deductions. Without this an employee whose salary has not
    // been captured yet gets a payslip showing ~KES 750 of SHIF/NSSF/levy against a
    // zero gross, and net pay clamps to 0 — which is not a real payslip.
    const hasEarnings = grossPay > 0;

    // Order matters: SHIF, NSSF and the housing levy are all charged on gross and are
    // then *deducted from taxable pay* before PAYE (Tax Laws (Amendment) Act 2024).
    // Computing PAYE on gross, as this used to, over-taxes every employee.
    const shifAmount = hasEarnings ? calcSHIF(grossPay) : 0;
    // Directors under old NSSF Act: flat KES 200/month (employee share)
    const { tier1: nssf1Amount, tier2: nssf2Amount } = !hasEarnings
      ? { tier1: 0, tier2: 0 }
      : isDirector
        ? { tier1: 20000, tier2: 0 }
        : calcNSSF(grossPay);
    const housingLevyAmount = hasEarnings ? calcHousingLevy(grossPay) : 0;

    const allowableDeductions = shifAmount + nssf1Amount + nssf2Amount + housingLevyAmount;
    const taxablePay = Math.max(0, grossPay - allowableDeductions);
    const payeAmount = hasEarnings ? calcPAYE(taxablePay) : 0;

    const totalDeductions = payeAmount + allowableDeductions;
    // Statutory deductions can never exceed what was actually earned. Without this a
    // token amount of commission on an employee with no basic salary produced a
    // payslip showing more deducted than earned.
    const cappedDeductions = Math.min(totalDeductions, grossPay);
    const netPay = grossPay - cappedDeductions;
    /** True when the statutory calculation had to be capped — surface it in HR. */
    const deductionsCapped = cappedDeductions < totalDeductions;

    return {
      grossPay,
      taxablePay,
      payeAmount,
      shifAmount,
      nssf1Amount,
      nssf2Amount,
      housingLevyAmount,
      totalDeductions: cappedDeductions,
      deductionsCapped,
      netPay,
      overtimeCents,
      overtimeHours,
    };
  }

  // ─── Create payroll run ─────────────────────────────────────────────────────

  async createPayrollRun(businessId: string, storeId: string | undefined, month: number, year: number) {
    // Check for duplicate
    // findFirst, not findUnique by the compound key: the tenant layer turns findUnique into a findFirst, which does not know the
    // key's name, so this used to fail with "Invalid or missing request parameter" and no payroll run could be created.
    const existing = await this.prisma.payrollRun.findFirst({ where: { businessId, month, year } });
    if (existing) {
      throw new BadRequestException(`Payroll for ${month}/${year} already exists (status: ${existing.status}). Delete it first or use the existing one.`);
    }

    // Fetch all employees for this business
    const employees = await this.prisma.employee.findMany({
      where: { businessId },
      include: {
        user: { select: { name: true, id: true } },
      },
    });

    if (employees.length === 0) {
      throw new BadRequestException('No employees found for this business.');
    }

    // Fetch commissions for this month from reports
    const startOfMonth = new Date(year, month - 1, 1);
    const endOfMonth = new Date(year, month, 0, 23, 59, 59, 999);

    // Build payslips
    const payslipData: Array<{
      employeeId: string;
      employeeName: string;
      basicSalary: number;
      housingAllowance: number;
      transportAllowance: number;
      otherAllowances: number;
      grossPay: number;
      payeAmount: number;
      shifAmount: number;
      nssf1Amount: number;
      nssf2Amount: number;
      housingLevyAmount: number;
      otherDeductions: number;
      netPay: number;
      commissionCents: number;
      status: string;
    }> = [];

    let totalGrossCents = 0;
    let totalNetCents = 0;
    let totalDeductionsCents = 0;

    for (const emp of employees) {
      // Commission earned in the target month: on the sales credited to this employee (see commission-base.ts). A sale is
      // credited to the cashier unless its lines name who performed them, in which case those people earn their own lines.
      let commissionCents = 0;
      try {
        const counted = { in: ['PAID', 'COMPLETED', 'AMENDED'] };
        const cashierSales = await this.prisma.sale.findMany({
          where: { cashierId: emp.userId, status: counted, createdAt: { gte: startOfMonth, lte: endOfMonth } },
          select: { id: true, totalCents: true, items: { select: { totalCents: true, staffId: true } } },
        });
        let servedLines: Array<{ saleId: string; totalCents: number }> = [];
        try {
          servedLines = await this.prisma.saleItem.findMany({
            where: { staffId: emp.userId, sale: { businessId, status: counted, createdAt: { gte: startOfMonth, lte: endOfMonth } } },
            select: { saleId: true, totalCents: true },
          });
        } catch {
          // lines naming staff are an addition: without them the cashier's own commission is still right
        }
        commissionCents = commissionAmount(emp.commissionBasis, emp.commissionRate, commissionBase(cashierSales, servedLines));
      } catch {
        // commission calculation is best-effort
      }

      const salaryBaseCents = emp.salaryBaseCents ?? 0;
      const housingCents = emp.housingAllowanceCents ?? 0;
      const transportCents = emp.transportAllowanceCents ?? 0;
      const otherAllowances = emp.otherAllowancesCents ?? 0;
      // Recurring deductions (SACCO, loan repayment, etc.)
      const saccoDeduction = emp.saccoDeductionCents ?? 0;
      const loanDeduction = emp.loanDeductionCents ?? 0;
      const otherDeductions = emp.otherDeductionsCents ?? 0;
      const totalExtraDeductions = saccoDeduction + loanDeduction + otherDeductions;

      // ── Overtime from attendance records ──────────────────────────────────────
      let overtimeHours = 0;
      try {
        const attendanceRecords = await this.prisma.attendanceRecord.findMany({
          where: {
            employeeId: emp.id,
            clockIn: { gte: startOfMonth, lte: endOfMonth },
            clockOut: { not: null },
          },
          select: { clockIn: true, clockOut: true },
        });
        const totalHoursWorked = attendanceRecords.reduce((sum, rec) => {
          if (!rec.clockOut) return sum;
          const diffMs = new Date(rec.clockOut).getTime() - new Date(rec.clockIn).getTime();
          return sum + diffMs / (1000 * 60 * 60);
        }, 0);
        const STANDARD_HOURS = 192;
        overtimeHours = Math.max(0, totalHoursWorked - STANDARD_HOURS);
      } catch {
        // overtime is best-effort
      }

      const calc = this.calculatePayslip({
        salaryBaseCents,
        housingCents,
        transportCents,
        commissionCents,
      }, overtimeHours);

      const netPayAfterExtra = Math.max(0, calc.netPay - totalExtraDeductions);
      // Use the capped statutory total so the run's deductions never exceed its gross.
      const deductions = calc.totalDeductions + Math.min(totalExtraDeductions, calc.netPay);

      totalGrossCents += calc.grossPay;
      totalNetCents += netPayAfterExtra;
      totalDeductionsCents += deductions;

      payslipData.push({
        employeeId: emp.id,
        employeeName: emp.user.name,
        basicSalary: salaryBaseCents,
        housingAllowance: housingCents,
        transportAllowance: transportCents,
        // otherAllowances includes overtime pay so it shows on payslip
        otherAllowances: otherAllowances + calc.overtimeCents,
        grossPay: calc.grossPay,
        payeAmount: calc.payeAmount,
        shifAmount: calc.shifAmount,
        nssf1Amount: calc.nssf1Amount,
        nssf2Amount: calc.nssf2Amount,
        housingLevyAmount: calc.housingLevyAmount,
        otherDeductions: totalExtraDeductions,
        netPay: netPayAfterExtra,
        commissionCents,
        status: 'PENDING',
      });
    }

    // Create payroll run with payslips in a transaction
    const payrollRun = await this.prisma.$transaction(async (tx) => {
      const run = await tx.payrollRun.create({
        data: {
          businessId,
          storeId: storeId ?? null,
          month,
          year,
          status: 'DRAFT',
          totalGrossCents,
          totalNetCents,
          totalDeductionsCents,
        },
      });

      await tx.payslip.createMany({
        data: payslipData.map((p) => ({ ...p, payrollRunId: run.id })),
      });

      return run;
    });

    return this.prisma.payrollRun.findUnique({
      where: { id: payrollRun.id },
      include: { payslips: true },
    });
  }

  // ─── Approve ────────────────────────────────────────────────────────────────

  async approvePayrollRun(runId: string, approvedBy: string) {
    const run = await this.prisma.payrollRun.findUnique({ where: { id: runId } });
    if (!run) throw new NotFoundException('Payroll run not found');
    if (run.status !== 'DRAFT') throw new BadRequestException('Only DRAFT payroll runs can be approved');

    return this.prisma.payrollRun.update({
      where: { id: runId },
      data: { status: 'APPROVED', approvedBy },
      include: { payslips: true },
    });
  }

  // ─── Mark as paid ───────────────────────────────────────────────────────────

  async markAsPaid(runId: string) {
    const run = await this.prisma.payrollRun.findUnique({ where: { id: runId } });
    if (!run) throw new NotFoundException('Payroll run not found');
    if (run.status !== 'APPROVED') throw new BadRequestException('Only APPROVED payroll runs can be marked as paid');

    return this.prisma.$transaction(async (tx) => {
      await tx.payslip.updateMany({
        where: { payrollRunId: runId },
        data: { status: 'PAID' },
      });

      return tx.payrollRun.update({
        where: { id: runId },
        data: { status: 'PAID', paidAt: new Date() },
        include: { payslips: true },
      });
    });
  }

  // ─── Queries ────────────────────────────────────────────────────────────────

  async getPayrollRuns(businessId: string) {
    return this.prisma.payrollRun.findMany({
      where: { businessId },
      include: {
        payslips: { select: { id: true, employeeName: true, grossPay: true, netPay: true, status: true } },
      },
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
    });
  }

  async getPayslipsByRun(runId: string) {
    const run = await this.prisma.payrollRun.findUnique({
      where: { id: runId },
      include: { payslips: true },
    });
    if (!run) throw new NotFoundException('Payroll run not found');
    return run;
  }

  async getEmployeePayslips(employeeId: string) {
    return this.prisma.payslip.findMany({
      where: { employeeId },
      include: { payrollRun: { select: { month: true, year: true, status: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ─── Delete (DRAFT only) ────────────────────────────────────────────────────

  async deletePayrollRun(runId: string) {
    const run = await this.prisma.payrollRun.findUnique({ where: { id: runId } });
    if (!run) throw new NotFoundException('Payroll run not found');
    if (run.status !== 'DRAFT') throw new BadRequestException('Only DRAFT payroll runs can be deleted');

    await this.prisma.$transaction(async (tx) => {
      await tx.payslip.deleteMany({ where: { payrollRunId: runId } });
      await tx.payrollRun.delete({ where: { id: runId } });
    });

    return { deleted: true };
  }

  async bulkSendPayslips(runId: string, channel: 'EMAIL' | 'WHATSAPP') {
    const payslips = await this.prisma.payslip.findMany({
      where: { payrollRunId: runId },
    });
    const results = payslips.map(slip => ({
      employeeId: slip.employeeId,
      name: slip.employeeName,
      channel,
      status: 'SENT',
    }));
    return { sent: results.length, channel, results };
  }
}

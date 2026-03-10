import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

// ─── Kenya 2024 Tax Constants ─────────────────────────────────────────────────

const PAYE_PERSONAL_RELIEF = 240000; // KES 2,400/month in cents
const NSSF_LEL_CENTS = 700000;       // Lower Earnings Limit: KES 7,000 in cents
const NSSF_UEL_CENTS = 3600000;      // Upper Earnings Limit: KES 36,000 in cents
const NSSF_TIER1_RATE = 0.06;        // 6% employee contribution
const NSSF_TIER2_RATE = 0.06;        // 6% employee contribution
const HOUSING_LEVY_RATE = 0.015;     // 1.5% of gross pay

// ─── PAYE Calculation (Kenya 2024) ───────────────────────────────────────────

function calcPAYE(grossCents: number): number {
  // Convert to KES whole units for bracket calculation
  const gross = grossCents / 100;

  let tax = 0;

  if (gross <= 24000) {
    tax = gross * 0.10;
  } else if (gross <= 32333) {
    tax = 24000 * 0.10 + (gross - 24000) * 0.25;
  } else if (gross <= 500000) {
    tax = 24000 * 0.10 + (32333 - 24000) * 0.25 + (gross - 32333) * 0.30;
  } else if (gross <= 800000) {
    tax = 24000 * 0.10 + (32333 - 24000) * 0.25 + (500000 - 32333) * 0.30 + (gross - 500000) * 0.325;
  } else {
    tax = 24000 * 0.10 + (32333 - 24000) * 0.25 + (500000 - 32333) * 0.30 + (800000 - 500000) * 0.325 + (gross - 800000) * 0.35;
  }

  // Personal relief: KES 2,400/month = 240000 cents
  const personalReliefKes = PAYE_PERSONAL_RELIEF / 100;
  const payeKes = Math.max(0, tax - personalReliefKes);

  return Math.round(payeKes * 100); // return in cents
}

// ─── NHIF Calculation ─────────────────────────────────────────────────────────

function calcNHIF(grossCents: number): number {
  const gross = grossCents / 100;

  if (gross <= 5999)   return 15000;  // KES 150
  if (gross <= 7999)   return 30000;  // KES 300
  if (gross <= 11999)  return 40000;  // KES 400
  if (gross <= 14999)  return 50000;  // KES 500
  if (gross <= 19999)  return 60000;  // KES 600
  if (gross <= 24999)  return 75000;  // KES 750
  if (gross <= 29999)  return 85000;  // KES 850
  if (gross <= 34999)  return 90000;  // KES 900
  if (gross <= 39999)  return 95000;  // KES 950
  if (gross <= 44999)  return 100000; // KES 1,000
  if (gross <= 49999)  return 110000; // KES 1,100
  if (gross <= 59999)  return 120000; // KES 1,200
  if (gross <= 69999)  return 130000; // KES 1,300
  if (gross <= 79999)  return 140000; // KES 1,400
  if (gross <= 89999)  return 150000; // KES 1,500
  if (gross <= 99999)  return 160000; // KES 1,600
  return 170000; // KES 1,700 for >= 100,000
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
}

interface PayslipResult {
  grossPay: number;
  payeAmount: number;
  nhifAmount: number;
  nssf1Amount: number;
  nssf2Amount: number;
  housingLevyAmount: number;
  netPay: number;
}

@Injectable()
export class PayrollService {
  constructor(private prisma: PrismaService) {}

  // ─── Core calculation ───────────────────────────────────────────────────────

  calculatePayslip(employee: PayslipInput): PayslipResult {
    const { salaryBaseCents, housingCents, transportCents, commissionCents } = employee;

    const grossPay = salaryBaseCents + housingCents + transportCents + commissionCents;

    const payeAmount = calcPAYE(grossPay);
    const nhifAmount = calcNHIF(grossPay);
    const { tier1: nssf1Amount, tier2: nssf2Amount } = calcNSSF(grossPay);
    const housingLevyAmount = calcHousingLevy(grossPay);

    const totalDeductions = payeAmount + nhifAmount + nssf1Amount + nssf2Amount + housingLevyAmount;
    const netPay = Math.max(0, grossPay - totalDeductions);

    return {
      grossPay,
      payeAmount,
      nhifAmount,
      nssf1Amount,
      nssf2Amount,
      housingLevyAmount,
      netPay,
    };
  }

  // ─── Create payroll run ─────────────────────────────────────────────────────

  async createPayrollRun(businessId: string, storeId: string | undefined, month: number, year: number) {
    // Check for duplicate
    const existing = await this.prisma.payrollRun.findUnique({
      where: { businessId_month_year: { businessId, month, year } },
    });
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
      nhifAmount: number;
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
      // Get commission earned by this employee in the target month
      let commissionCents = 0;
      try {
        const sales = await this.prisma.sale.findMany({
          where: {
            cashierId: emp.userId,
            status: 'COMPLETED',
            createdAt: { gte: startOfMonth, lte: endOfMonth },
          },
          select: { totalCents: true },
        });

        const totalSalesCents = sales.reduce((sum, s) => sum + s.totalCents, 0);

        if (emp.commissionBasis === 'SALES_VALUE') {
          commissionCents = Math.round(totalSalesCents * (emp.commissionRate / 100));
        } else if (emp.commissionBasis === 'TRANSACTION_COUNT') {
          commissionCents = Math.round(sales.length * emp.commissionRate * 100);
        }
        // GROSS_MARGIN would require cost data — skip for now
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

      const calc = this.calculatePayslip({
        salaryBaseCents,
        housingCents,
        transportCents,
        commissionCents,
      });

      const netPayAfterExtra = Math.max(0, calc.netPay - totalExtraDeductions);
      const deductions = calc.payeAmount + calc.nhifAmount + calc.nssf1Amount + calc.nssf2Amount + calc.housingLevyAmount + totalExtraDeductions;

      totalGrossCents += calc.grossPay;
      totalNetCents += netPayAfterExtra;
      totalDeductionsCents += deductions;

      payslipData.push({
        employeeId: emp.id,
        employeeName: emp.user.name,
        basicSalary: salaryBaseCents,
        housingAllowance: housingCents,
        transportAllowance: transportCents,
        otherAllowances,
        grossPay: calc.grossPay,
        payeAmount: calc.payeAmount,
        nhifAmount: calc.nhifAmount,
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
}

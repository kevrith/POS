import { BadRequestException } from '@nestjs/common';
import { HrService } from './hr.service';

function makeEmployee(overrides: Record<string, any> = {}) {
  return { id: 'emp-1', businessId: 'biz-1', userId: 'user-1', position: 'Cashier', department: 'Sales', startDate: new Date('2025-01-01'), user: { id: 'user-1', name: 'Alice', role: 'CASHIER', email: 'alice@cafe.co.ke', pinHash: null }, ...overrides };
}

function makeAttendance(overrides: Record<string, any> = {}) {
  return { id: 'att-1', businessId: 'biz-1', storeId: 'store-1', employeeId: 'emp-1', clockIn: new Date(), clockOut: null, isLate: false, ...overrides };
}

function makePrisma() {
  return {
    employee: { findMany: jest.fn(), create: jest.fn(), findFirst: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    user: { findFirst: jest.fn(), update: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
    attendanceRecord: { findMany: jest.fn(), create: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
    leave: { findMany: jest.fn(), create: jest.fn(), update: jest.fn(), findUnique: jest.fn().mockResolvedValue({ id: 'leave-1', startDate: new Date(), endDate: new Date(), employeeId: 'emp-1', leaveType: 'ANNUAL' }) },
    leaveBalance: { findFirst: jest.fn().mockResolvedValue({ id: 'lb-1', used: 0, allocated: 20 }), create: jest.fn().mockResolvedValue({}), update: jest.fn().mockResolvedValue({}), upsert: jest.fn().mockResolvedValue({}) },
    shift: { findMany: jest.fn(), create: jest.fn(), delete: jest.fn() },
    sale: { findMany: jest.fn().mockResolvedValue([]) },
  };
}

function makeService(overrides = {}) {
  const prisma: any = { ...makePrisma(), ...overrides };
  // HrService constructor may vary; inject what it needs
  const notifications = { notifyCashDiscrepancy: jest.fn(), notifyBatchRecall: jest.fn(), createNotification: jest.fn() };
  const svc = new HrService(prisma, notifications as any);
  return { svc, prisma };
}

describe('HrService', () => {
  describe('getEmployees', () => {
    it('lists every staff member, not only those with an HR record', async () => {
      const { svc, prisma } = makeService();
      prisma.employee.findMany.mockResolvedValue([makeEmployee()]);
      prisma.user.findMany.mockResolvedValue([
        { id: 'user-1', name: 'Alice', email: 'alice@cafe.co.ke', role: 'CASHIER', phone: null, createdAt: new Date() },
        { id: 'user-2', name: 'Brian', email: 'brian@cafe.co.ke', role: 'DRIVER', phone: null, createdAt: new Date() },
      ]);

      const result = await svc.getEmployees('biz-1');

      // Returning only Employee rows is what made HR report "0 employees" for a
      // business whose staff were added under Settings → Users.
      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({ id: 'emp-1', hasHrRecord: true });
      expect(result[1]).toMatchObject({ id: null, userId: 'user-2', hasHrRecord: false });
      expect(prisma.employee.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: { businessId: 'biz-1' },
      }));
    });

    it('filters by role so a driver picker never lists cashiers', async () => {
      const { svc, prisma } = makeService();
      prisma.employee.findMany.mockResolvedValue([]);
      prisma.user.findMany.mockResolvedValue([
        { id: 'user-2', name: 'Brian', email: null, role: 'DRIVER', phone: null, createdAt: new Date() },
      ]);

      const result = await svc.getEmployees('biz-1', { role: 'DRIVER' });

      expect(result).toHaveLength(1);
      expect(prisma.user.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: { businessId: 'biz-1', role: 'DRIVER' },
      }));
    });

    it('onlyWithHrRecord returns just the real Employee rows', async () => {
      const { svc, prisma } = makeService();
      prisma.employee.findMany.mockResolvedValue([makeEmployee()]);

      const result = await svc.getEmployees('biz-1', { onlyWithHrRecord: true });

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({ id: 'emp-1', hasHrRecord: true });
      expect(prisma.user.findMany).not.toHaveBeenCalled();
    });
  });

  describe('createEmployee', () => {
    it('creates an employee record', async () => {
      const employee = makeEmployee();
      const { svc, prisma } = makeService();
      prisma.user.findFirst.mockResolvedValue({ id: 'user-1', businessId: 'biz-1' });
      prisma.employee.findFirst.mockResolvedValue(null);
      prisma.employee.create.mockResolvedValue(employee);
      const dto = { userId: 'user-1' };
      await svc.createEmployee('biz-1', dto);
      expect(prisma.employee.create).toHaveBeenCalledTimes(1);
    });

    it('throws if user not found in business', async () => {
      const { svc, prisma } = makeService();
      prisma.user.findFirst.mockResolvedValue(null);
      await expect(svc.createEmployee('biz-1', { userId: 'bad' })).rejects.toThrow(BadRequestException);
    });

    it('throws if employee already exists', async () => {
      const { svc, prisma } = makeService();
      prisma.user.findFirst.mockResolvedValue({ id: 'user-1' });
      prisma.employee.findFirst.mockResolvedValue(makeEmployee());
      await expect(svc.createEmployee('biz-1', { userId: 'user-1' })).rejects.toThrow(BadRequestException);
    });
  });

  describe('clockIn', () => {
    it('creates an attendance record with clockIn time', async () => {
      const record = makeAttendance();
      const { svc, prisma } = makeService();
      prisma.attendanceRecord.create.mockResolvedValue(record);
      const result = await svc.clockIn({ offlineId: 'uuid-1', storeId: 'store-1', employeeId: 'emp-1', clockIn: new Date(), shiftDate: new Date() });
      expect(prisma.attendanceRecord.create).toHaveBeenCalledTimes(1);
      expect(result.employeeId).toBe('emp-1');
    });
  });

  describe('clockOut', () => {
    it('updates attendance record with clockOut time', async () => {
      const record = makeAttendance({ clockOut: new Date() });
      const { svc, prisma } = makeService();
      prisma.attendanceRecord.update.mockResolvedValue(record);
      const result = await svc.clockOut('att-1', new Date());
      expect(result.clockOut).toBeDefined();
    });
  });

  describe('getLeaves', () => {
    it('returns leaves for an employee', async () => {
      const { svc, prisma } = makeService();
      prisma.leave.findMany.mockResolvedValue([{ id: 'leave-1', status: 'PENDING' }]);
      const result = await svc.getLeaves('emp-1');
      expect(result).toHaveLength(1);
    });
  });

  describe('approveLeave', () => {
    it('sets leave status to APPROVED', async () => {
      const { svc, prisma } = makeService();
      prisma.leave.update.mockResolvedValue({ id: 'leave-1', status: 'APPROVED' });
      await svc.approveLeave('leave-1', 'manager-1');
      const data = prisma.leave.update.mock.calls[0][0].data;
      expect(data.status).toBe('APPROVED');
    });
  });

  describe('rejectLeave', () => {
    it('sets leave status to REJECTED', async () => {
      const { svc, prisma } = makeService();
      prisma.leave.update.mockResolvedValue({ id: 'leave-1', status: 'REJECTED' });
      await svc.rejectLeave('leave-1', 'manager-1');
      const data = prisma.leave.update.mock.calls[0][0].data;
      expect(data.status).toBe('REJECTED');
    });
  });
});

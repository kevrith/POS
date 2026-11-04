import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrintJobsService } from './print-jobs.service';

const owner = { id: 'u1', businessId: 'biz-A', role: 'OWNER' };
const cashier = { id: 'u2', businessId: 'biz-A', role: 'CASHIER' };
const bytes = Buffer.from('hello printer').toString('base64');

function makeService(mode?: 'queue') {
  if (mode) process.env.PRINT_DELIVERY_MODE = mode; else delete process.env.PRINT_DELIVERY_MODE;
  const prisma: any = {
    store: { findFirst: jest.fn().mockResolvedValue({ id: 's1' }) },
    printer: { findFirst: jest.fn().mockResolvedValue({ id: 'p1', connectionType: 'NETWORK', connectionDetails: '192.168.1.50' }) },
    sale: { findFirst: jest.fn().mockResolvedValue({ id: 'sale1' }) },
    printJob: {
      create: jest.fn().mockResolvedValue({ id: 'j1' }),
      update: jest.fn().mockImplementation(async ({ data }) => ({ id: 'j1', ...data })),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findFirst: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'j1', status: 'QUEUED' }),
      count: jest.fn().mockResolvedValue(0),
    },
  };
  const printers: any = { printToNetwork: jest.fn().mockResolvedValue({ success: true }) };
  return { prisma, printers, service: new PrintJobsService(prisma, printers) };
}

afterEach(() => { delete process.env.PRINT_DELIVERY_MODE; });

describe('enqueue', () => {
  const dto = { storeId: 's1', printerId: 'p1', kind: 'KOT', data: bytes };

  it('refuses a store, a printer or a payload that is not the caller\'s or not valid', async () => {
    const t = makeService();
    t.prisma.store.findFirst.mockResolvedValue(null);
    await expect(t.service.enqueue(dto, owner)).rejects.toBeInstanceOf(NotFoundException);

    const t2 = makeService();
    t2.prisma.printer.findFirst.mockResolvedValue(null);
    await expect(t2.service.enqueue(dto, owner)).rejects.toBeInstanceOf(NotFoundException);
    expect(t2.prisma.printer.findFirst).toHaveBeenCalledWith({ where: { id: 'p1', storeId: 's1', store: { businessId: 'biz-A' } } });

    const t3 = makeService();
    t3.prisma.printer.findFirst.mockResolvedValue({ id: 'p1', connectionType: 'STAR', connectionDetails: '' });
    await expect(t3.service.enqueue(dto, owner)).rejects.toBeInstanceOf(BadRequestException);

    const t4 = makeService();
    await expect(t4.service.enqueue({ ...dto, kind: 'INVOICE' }, owner)).rejects.toBeInstanceOf(BadRequestException);
    await expect(t4.service.enqueue({ ...dto, data: '' }, owner)).rejects.toBeInstanceOf(BadRequestException);
    await expect(t4.service.enqueue({ ...dto, data: Buffer.alloc(1024 * 1024 + 1).toString('base64') }, owner)).rejects.toThrow(/too large/);
    expect(t4.prisma.printJob.create).not.toHaveBeenCalled();
  });

  it('direct mode: prints at once and drops the stored bytes', async () => {
    const t = makeService();
    const res = await t.service.enqueue(dto, owner);
    expect(t.printers.printToNetwork).toHaveBeenCalledWith('p1', bytes, 'biz-A');
    expect(res.delivered).toBe(true);
    expect(t.prisma.printJob.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'SENT', method: 'DIRECT', payload: null }),
    }));
  });

  it('direct mode: a printer this server cannot reach stays queued for a bridge, with the reason and a delay', async () => {
    const t = makeService();
    t.printers.printToNetwork.mockRejectedValue(new Error('Cannot reach printer at 192.168.1.50:9100 (ETIMEDOUT)'));
    const res = await t.service.enqueue(dto, owner);
    expect(res.delivered).toBe(false);
    const data = t.prisma.printJob.update.mock.calls[0][0].data;
    expect(data.lastError).toContain('ETIMEDOUT');
    expect(data.attempts).toBe(1);
    expect(data.status).toBeUndefined();
    expect(data.nextAttemptAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('queue mode never touches the LAN from the server', async () => {
    const t = makeService('queue');
    const res = await t.service.enqueue(dto, owner);
    expect(t.printers.printToNetwork).not.toHaveBeenCalled();
    expect(res.delivered).toBe(false);
    expect(t.prisma.printJob.create.mock.calls[0][0].data).toEqual(expect.objectContaining({
      status: 'QUEUED', method: 'BRIDGE', payload: bytes, businessId: 'biz-A', createdById: 'u1',
    }));
  });

  it('gives a kitchen ticket a short life', async () => {
    const t = makeService('queue');
    await t.service.enqueue(dto, owner);
    const { expiresAt } = t.prisma.printJob.create.mock.calls[0][0].data;
    expect(expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(15 * 60_000);
  });
});

describe('log (prints made on the till itself)', () => {
  it('records the outcome and who printed, without bytes', async () => {
    const t = makeService();
    await t.service.log({ storeId: 's1', kind: 'RECEIPT', method: 'USB', ok: false, error: 'No USB printer is paired', saleId: 'sale1', copyNumber: 1 }, cashier);
    expect(t.prisma.printJob.create.mock.calls[0][0].data).toEqual(expect.objectContaining({
      status: 'FAILED', method: 'USB', lastError: 'No USB printer is paired', createdById: 'u2', copyNumber: 1, businessId: 'biz-A',
    }));
    expect(t.prisma.printJob.create.mock.calls[0][0].data.payload).toBeUndefined();
  });

  it('rejects an unknown method or kind', async () => {
    const t = makeService();
    await expect(t.service.log({ storeId: 's1', kind: 'RECEIPT', method: 'FAX', ok: true }, cashier)).rejects.toBeInstanceOf(BadRequestException);
    await expect(t.service.log({ storeId: 's1', kind: 'X', method: 'USB', ok: true }, cashier)).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('nextReceiptCopy', () => {
  it('counts prints that happened or are waiting, so the next one is marked a copy', async () => {
    const t = makeService();
    t.prisma.printJob.count.mockResolvedValue(2);
    expect(await t.service.nextReceiptCopy('sale1', cashier)).toEqual({ copyNumber: 2 });
    expect(t.prisma.printJob.count).toHaveBeenCalledWith({
      where: { businessId: 'biz-A', saleId: 'sale1', kind: 'RECEIPT', status: { in: ['SENT', 'QUEUED', 'SENDING'] } },
    });
  });

  it('will not reveal another business\'s sale', async () => {
    const t = makeService();
    t.prisma.sale.findFirst.mockResolvedValue(null);
    await expect(t.service.nextReceiptCopy('sale-of-B', cashier)).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('visibility and recovery are for owners and managers', () => {
  it('forbids a cashier from listing, retrying or cancelling', async () => {
    const t = makeService();
    await expect(t.service.list('s1', undefined, undefined, cashier)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(t.service.retry('j1', cashier)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(t.service.cancel('j1', cashier)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('list never returns the bytes and expires overdue jobs first', async () => {
    const t = makeService();
    await t.service.list('s1', 'FAILED', 10, owner);
    expect(t.prisma.printJob.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'EXPIRED' }) }));
    const args = t.prisma.printJob.findMany.mock.calls[0][0];
    expect(args.select.payload).toBeUndefined();
    expect(args.where).toEqual({ businessId: 'biz-A', storeId: 's1', status: 'FAILED' });
  });

  it('retries only a dead job that still has bytes', async () => {
    const t = makeService();
    t.prisma.printJob.findFirst.mockResolvedValue({ id: 'j1', status: 'SENT', payload: null, kind: 'KOT' });
    await expect(t.service.retry('j1', owner)).rejects.toBeInstanceOf(BadRequestException);
    t.prisma.printJob.findFirst.mockResolvedValue({ id: 'j1', status: 'FAILED', payload: null, kind: 'KOT' });
    await expect(t.service.retry('j1', owner)).rejects.toThrow(/no bytes/);
    t.prisma.printJob.findFirst.mockResolvedValue({ id: 'j1', status: 'FAILED', payload: bytes, kind: 'KOT' });
    await t.service.retry('j1', owner);
    expect(t.prisma.printJob.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'QUEUED', attempts: 0, method: 'BRIDGE' }),
    }));
  });
});

describe('print bridge', () => {
  const queuedJob = { id: 'j1', kind: 'RECEIPT', status: 'QUEUED', claimedAt: null, payload: bytes, printerId: 'p1', attempts: 1 };

  it('hands a job to exactly one bridge: losing the conditional update means skipping it', async () => {
    const t = makeService();
    t.prisma.printJob.findMany.mockResolvedValue([queuedJob]);
    t.prisma.printJob.updateMany.mockResolvedValueOnce({ count: 0 }); // expireOverdue
    t.prisma.printJob.updateMany.mockResolvedValueOnce({ count: 0 }); // another bridge won the claim
    expect(await t.service.claim('s1', 'bridge-1', 5, cashier)).toEqual([]);
  });

  it('returns the bytes and the printer\'s private address to the winner', async () => {
    const t = makeService();
    t.prisma.printJob.findMany.mockResolvedValue([queuedJob]);
    const jobs = await t.service.claim('s1', 'bridge-1', 5, cashier);
    expect(jobs).toEqual([{ id: 'j1', kind: 'RECEIPT', data: bytes, host: '192.168.1.50', port: 9100, attempts: 2 }]);
    expect(t.prisma.printJob.updateMany).toHaveBeenLastCalledWith({
      where: { id: 'j1', status: 'QUEUED', claimedAt: null },
      data: expect.objectContaining({ status: 'SENDING', claimedBy: 'bridge-1', attempts: { increment: 1 } }),
    });
  });

  it('only looks at the caller\'s own store and business, and recovers jobs a dead bridge left SENDING', async () => {
    const t = makeService();
    await t.service.claim('s1', 'bridge-1', 5, cashier);
    const where = t.prisma.printJob.findMany.mock.calls[0][0].where;
    expect(where.businessId).toBe('biz-A');
    expect(where.storeId).toBe('s1');
    expect(where.OR).toEqual([{ status: 'QUEUED' }, { status: 'SENDING', claimedAt: { lt: expect.any(Date) } }]);
  });

  it('fails a job whose printer is not a private IP literal instead of sending bytes anywhere', async () => {
    for (const details of ['printer.example.com', '8.8.8.8', '127.0.0.1:22']) {
      const t = makeService();
      t.prisma.printJob.findMany.mockResolvedValue([queuedJob]);
      t.prisma.printer.findFirst.mockResolvedValue({ id: 'p1', connectionDetails: details });
      expect(await t.service.claim('s1', 'bridge-1', 5, cashier)).toEqual([]);
      expect(t.prisma.printJob.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'FAILED' }) }));
    }
  });

  it('a successful delivery marks the job SENT and drops the bytes', async () => {
    const t = makeService();
    t.prisma.printJob.findFirst.mockResolvedValue({ id: 'j1', status: 'SENDING', claimedBy: 'bridge-1', attempts: 1 });
    await t.service.complete('j1', { ok: true }, 'bridge-1', cashier);
    expect(t.prisma.printJob.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'SENT', payload: null }),
    }));
  });

  it('a failed delivery goes back in the queue with a delay, then fails for good at the attempt limit', async () => {
    const t = makeService();
    t.prisma.printJob.findFirst.mockResolvedValue({ id: 'j1', status: 'SENDING', claimedBy: 'bridge-1', attempts: 2 });
    await t.service.complete('j1', { ok: false, error: 'ECONNREFUSED' }, 'bridge-1', cashier);
    let data = t.prisma.printJob.update.mock.calls[0][0].data;
    expect(data.status).toBe('QUEUED');
    expect(data.nextAttemptAt.getTime()).toBeGreaterThan(Date.now());
    expect(data.lastError).toBe('ECONNREFUSED');

    t.prisma.printJob.findFirst.mockResolvedValue({ id: 'j1', status: 'SENDING', claimedBy: 'bridge-1', attempts: 5 });
    await t.service.complete('j1', { ok: false, error: 'ECONNREFUSED' }, 'bridge-1', cashier);
    data = t.prisma.printJob.update.mock.calls[1][0].data;
    expect(data.status).toBe('FAILED');
  });

  it('ignores a result from a bridge that no longer owns the job', async () => {
    const t = makeService();
    t.prisma.printJob.findFirst.mockResolvedValue({ id: 'j1', status: 'SENDING', claimedBy: 'bridge-2', attempts: 1 });
    expect(await t.service.complete('j1', { ok: true }, 'bridge-1', cashier)).toEqual({ status: 'SENDING' });
    expect(t.prisma.printJob.update).not.toHaveBeenCalled();
  });

  it('cannot touch another business\'s job', async () => {
    const t = makeService();
    t.prisma.printJob.findFirst.mockResolvedValue(null);
    await expect(t.service.complete('jX', { ok: true }, 'bridge-1', cashier)).rejects.toBeInstanceOf(NotFoundException);
    expect(t.prisma.printJob.findFirst).toHaveBeenCalledWith({ where: { id: 'jX', businessId: 'biz-A' } });
  });
});

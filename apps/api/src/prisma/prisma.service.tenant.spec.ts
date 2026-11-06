import { NotFoundException } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { tenantContext } from './tenant-context';

/**
 * The tenant middleware checks that a record belongs to the caller's business before an update or delete by id.
 *
 * That check once ran through the client itself (`this.store.findFirst`). Inside a sale's transaction that opened a SECOND
 * connection while the transaction held the first; on a pool of one (connection_limit=1, as the pgbouncer URL sets) it waited
 * for a connection that could never free up, timed out after 10 seconds and failed every checkout with a 500. These tests pin
 * both halves: the check still protects other businesses' records, and it stays on the caller's own connection.
 */
async function middleware() {
  const svc = new PrismaService();
  (svc as any).$connect = jest.fn().mockResolvedValue(undefined);
  let mw!: (params: any, next: (p: any) => Promise<unknown>) => Promise<unknown>;
  (svc as any).$use = (fn: typeof mw) => { mw = fn; };
  await svc.onModuleInit();
  return { svc, mw };
}

const inTenant = <T>(businessId: string, fn: () => Promise<T>) => tenantContext.run({ businessId }, fn);

describe('tenant middleware: update and delete by id', () => {
  it('checks ownership through `next`, never through the client (so it cannot take a second connection)', async () => {
    const { svc, mw } = await middleware();
    const clientCheck = jest.spyOn((svc as any).store, 'findFirst');
    const next = jest.fn().mockResolvedValue({ id: 'store-1' });

    await inTenant('biz-1', () => mw({ model: 'Store', action: 'update', args: { where: { id: 'store-1' }, data: { name: 'x' } } }, next));

    expect(clientCheck).not.toHaveBeenCalled();
    // first call: the ownership check, scoped to the caller's business; second: the real update, unchanged
    expect(next).toHaveBeenCalledTimes(2);
    expect(next.mock.calls[0][0]).toMatchObject({ model: 'Store', action: 'findFirst', args: { where: { id: 'store-1', businessId: 'biz-1' }, select: { id: true } } });
    expect(next.mock.calls[1][0]).toMatchObject({ action: 'update', args: { where: { id: 'store-1' }, data: { name: 'x' } } });
  });

  it("still refuses another business's record, and does not run the update", async () => {
    const { mw } = await middleware();
    const next = jest.fn().mockResolvedValueOnce(null); // the ownership check finds nothing for this business

    await expect(inTenant('biz-1', () => mw({ model: 'Store', action: 'delete', args: { where: { id: 'someone-elses' } } }, next)))
      .rejects.toBeInstanceOf(NotFoundException);
    expect(next).toHaveBeenCalledTimes(1); // only the check; the delete never ran
  });

  it('does nothing when the caller already scoped the update to a business', async () => {
    const { mw } = await middleware();
    const next = jest.fn().mockResolvedValue({});
    await inTenant('biz-1', () => mw({ model: 'Store', action: 'update', args: { where: { id: 's', businessId: 'biz-1' }, data: {} } }, next));
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('does nothing outside a request (seeds, jobs, super-admin)', async () => {
    const { mw } = await middleware();
    const next = jest.fn().mockResolvedValue({});
    await mw({ model: 'Store', action: 'update', args: { where: { id: 's' }, data: {} } }, next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('adds the business to a single-record read, so another business cannot read it by id', async () => {
    const { mw } = await middleware();
    const next = jest.fn().mockResolvedValue({});
    await inTenant('biz-1', () => mw({ model: 'Store', action: 'findUnique', args: { where: { id: 's' } } }, next));
    expect(next.mock.calls[0][0]).toMatchObject({ action: 'findFirst', args: { where: { id: 's', businessId: 'biz-1' } } });
  });
});

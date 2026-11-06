import { AuditService } from './audit.service';

const entry = { businessId: 'b1', actor: 'u1', actorType: 'USER' as const, action: 'SALE_RETURNED', entity: 'Sale', entityId: 's1' };

describe('AuditService.createEntry', () => {
  const client = (lastHash?: string) => ({ auditLog: { findFirst: jest.fn().mockResolvedValue(lastHash ? { hash: lastHash } : null), create: jest.fn().mockResolvedValue({}) } });

  it("writes through the transaction client it is given, and never touches the service's own connection", async () => {
    const own = client();
    const tx = client();
    await new AuditService(own as any).createEntry(entry, tx as any);
    expect(tx.auditLog.findFirst).toHaveBeenCalledTimes(1);
    expect(tx.auditLog.create).toHaveBeenCalledTimes(1);
    expect(own.auditLog.findFirst).not.toHaveBeenCalled();
    expect(own.auditLog.create).not.toHaveBeenCalled();
  });

  it('uses its own connection when no transaction is given', async () => {
    const own = client();
    await new AuditService(own as any).createEntry(entry);
    expect(own.auditLog.create).toHaveBeenCalledTimes(1);
  });

  it('chains each entry to the hash of the one before it', async () => {
    const tx = client('a'.repeat(64));
    await new AuditService(client() as any).createEntry(entry, tx as any);
    expect(tx.auditLog.create.mock.calls[0][0].data.previousHash).toBe('a'.repeat(64));
  });

  it('starts the chain from zeros for a business with no entries yet', async () => {
    const tx = client();
    await new AuditService(client() as any).createEntry(entry, tx as any);
    expect(tx.auditLog.create.mock.calls[0][0].data.previousHash).toBe('0'.repeat(64));
  });
});

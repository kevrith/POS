import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrintersService } from './printers.service';

describe('PrintersService tenant scoping', () => {
  let prisma: any;
  let service: PrintersService;

  beforeEach(() => {
    prisma = {
      printer: {
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        delete: jest.fn(),
      },
      store: { findFirst: jest.fn() },
    };
    service = new PrintersService(prisma);
  });

  it('only lists printers of stores that belong to the caller business', async () => {
    await service.getPrinters('store-1', 'biz-A');
    expect(prisma.printer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { storeId: 'store-1', store: { businessId: 'biz-A' } } }),
    );
  });

  it('refuses to create a printer in another business store', async () => {
    prisma.store.findFirst.mockResolvedValue(null);
    await expect(
      service.createPrinter({ storeId: 'store-B', name: 'P', connectionType: 'NETWORK', handles: ['RECEIPT'] }, 'biz-A'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.printer.create).not.toHaveBeenCalled();
  });

  it('returns 404 when deleting a printer owned by another business', async () => {
    prisma.printer.findFirst.mockResolvedValue(null);
    await expect(service.deletePrinter('p1', 'biz-A')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.printer.delete).not.toHaveBeenCalled();
  });

  it('returns 404 when printing through another business printer', async () => {
    prisma.printer.findFirst.mockResolvedValue(null);
    await expect(service.printToNetwork('p1', 'AAAA', 'biz-A')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects a print job aimed at a loopback address stored on the printer row', async () => {
    prisma.printer.findFirst.mockResolvedValue({ id: 'p1', connectionType: 'NETWORK', connectionDetails: '127.0.0.1:5432' });
    await expect(service.printToNetwork('p1', Buffer.from('hi').toString('base64'), 'biz-A')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('accepts handles sent as a JSON string or an array', async () => {
    prisma.printer.findFirst.mockResolvedValue({ id: 'p1', storeId: 's1' });
    await service.updatePrinter('p1', { handles: '["RECEIPT","BILL"]' as unknown as string[] }, 'biz-A');
    expect(prisma.printer.update).toHaveBeenLastCalledWith(expect.objectContaining({ data: { handles: '["RECEIPT","BILL"]' } }));
    await service.updatePrinter('p1', { handles: ['KOT_FOOD'] }, 'biz-A');
    expect(prisma.printer.update).toHaveBeenLastCalledWith(expect.objectContaining({ data: { handles: '["KOT_FOOD"]' } }));
  });

  it('rejects malformed handles with 400', async () => {
    prisma.printer.findFirst.mockResolvedValue({ id: 'p1', storeId: 's1' });
    await expect(service.updatePrinter('p1', { handles: '{oops' as unknown as string[] }, 'biz-A')).rejects.toBeInstanceOf(BadRequestException);
  });
});

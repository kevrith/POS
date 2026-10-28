import { BadGatewayException, BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { createConnection } from 'net';
import { PrismaService } from '../prisma/prisma.service';
import { requireArray, requireString } from '../common/validate';
import { resolvePrinterTarget } from './network-target';

interface CreatePrinterDto {
  storeId: string;
  name: string;
  connectionType: string;
  connectionDetails?: string;
  isDefault?: boolean;
  handles: string[];
}

interface UpdatePrinterDto {
  name?: string;
  connectionType?: string;
  connectionDetails?: string;
  isDefault?: boolean;
  handles?: string[];
}

/** A receipt is a few KB; this only stops a client streaming megabytes at a printer. */
const MAX_PRINT_BYTES = 1024 * 1024;

@Injectable()
export class PrintersService {
  constructor(private prisma: PrismaService) {}

  /** Printers belong to a store, so a printer id is only valid inside the caller's business. */
  private async findOwnedPrinter(id: string, businessId: string) {
    const printer = await this.prisma.printer.findFirst({
      where: { id, store: { businessId } },
    });
    if (!printer) throw new NotFoundException('Printer not found');
    return printer;
  }

  async getPrinters(storeId: string, businessId: string) {
    requireString(storeId, 'storeId');
    return this.prisma.printer.findMany({
      where: { storeId, store: { businessId } },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    });
  }

  async createPrinter(dto: CreatePrinterDto, businessId: string) {
    requireString(dto?.storeId, 'storeId');
    requireString(dto.name, 'name');
    requireString(dto.connectionType, 'connectionType');
    const handles = dto.handles === undefined ? ['RECEIPT'] : requireArray<string>(dto.handles, 'handles');

    const store = await this.prisma.store.findFirst({ where: { id: dto.storeId, businessId }, select: { id: true } });
    if (!store) throw new NotFoundException('Store not found');

    // If setting as default, clear existing defaults first
    if (dto.isDefault) {
      await this.prisma.printer.updateMany({
        where: { storeId: dto.storeId, isDefault: true },
        data: { isDefault: false },
      });
    }
    return this.prisma.printer.create({
      data: {
        storeId: dto.storeId,
        name: dto.name,
        connectionType: dto.connectionType,
        connectionDetails: dto.connectionDetails ?? '',
        isDefault: dto.isDefault ?? false,
        handles: JSON.stringify(handles),
      },
    });
  }

  async updatePrinter(id: string, dto: UpdatePrinterDto, businessId: string) {
    const printer = await this.findOwnedPrinter(id, businessId);

    // The web client has sent `handles` both as an array and as a pre-stringified
    // array; accept either, store one canonical form.
    let handles: string[] | undefined;
    if (dto.handles !== undefined) {
      const raw: unknown = dto.handles;
      try {
        handles = requireArray<string>(typeof raw === 'string' ? JSON.parse(raw) : raw, 'handles');
      } catch (e) {
        if (e instanceof BadRequestException) throw e;
        throw new BadRequestException('handles must be an array');
      }
    }

    if (dto.isDefault) {
      await this.prisma.printer.updateMany({
        where: { storeId: printer.storeId, isDefault: true, id: { not: id } },
        data: { isDefault: false },
      });
    }

    return this.prisma.printer.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.connectionType !== undefined && { connectionType: dto.connectionType }),
        ...(dto.connectionDetails !== undefined && { connectionDetails: dto.connectionDetails }),
        ...(dto.isDefault !== undefined && { isDefault: dto.isDefault }),
        ...(handles !== undefined && { handles: JSON.stringify(handles) }),
      },
    });
  }

  async deletePrinter(id: string, businessId: string) {
    await this.findOwnedPrinter(id, businessId);
    await this.prisma.printer.delete({ where: { id } });
    return { message: 'Printer deleted' };
  }

  async printToNetwork(printerId: string, data: string, businessId: string): Promise<{ success: boolean }> {
    const printer = await this.findOwnedPrinter(printerId, businessId);
    if (printer.connectionType !== 'NETWORK') throw new BadRequestException('Printer is not a network printer');
    requireString(data, 'data');

    const buffer = Buffer.from(data, 'base64');
    if (buffer.length === 0) throw new BadRequestException('data must be base64-encoded print bytes');
    if (buffer.length > MAX_PRINT_BYTES) throw new BadRequestException('Print job is too large');

    const { host, port } = await resolvePrinterTarget(printer.connectionDetails);

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => { socket.destroy(); reject(new BadGatewayException('Network printer timeout')); }, 5000);
      const socket = createConnection(port, host, () => {
        socket.write(buffer, () => {
          socket.end();
          clearTimeout(timeout);
          resolve({ success: true });
        });
      });
      socket.on('error', (err) => {
        clearTimeout(timeout);
        reject(new BadGatewayException(`Cannot reach printer at ${host}:${port} (${(err as NodeJS.ErrnoException).code ?? err.message})`));
      });
    });
  }
}

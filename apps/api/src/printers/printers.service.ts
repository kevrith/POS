import { Injectable, NotFoundException } from '@nestjs/common';
import { createConnection } from 'net';
import { PrismaService } from '../prisma/prisma.service';

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

@Injectable()
export class PrintersService {
  constructor(private prisma: PrismaService) {}

  async getPrinters(storeId: string) {
    return this.prisma.printer.findMany({
      where: { storeId },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    });
  }

  async createPrinter(dto: CreatePrinterDto) {
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
        handles: JSON.stringify(dto.handles ?? ['RECEIPT']),
      },
    });
  }

  async updatePrinter(id: string, dto: UpdatePrinterDto) {
    const printer = await this.prisma.printer.findUnique({ where: { id } });
    if (!printer) throw new NotFoundException('Printer not found');

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
        ...(dto.handles !== undefined && { handles: JSON.stringify(dto.handles) }),
      },
    });
  }

  async deletePrinter(id: string) {
    const printer = await this.prisma.printer.findUnique({ where: { id } });
    if (!printer) throw new NotFoundException('Printer not found');
    await this.prisma.printer.delete({ where: { id } });
    return { message: 'Printer deleted' };
  }

  async printToNetwork(printerId: string, data: string): Promise<{ success: boolean }> {
    const printer = await this.prisma.printer.findUnique({ where: { id: printerId } });
    if (!printer) throw new NotFoundException('Printer not found');
    if (printer.connectionType !== 'NETWORK') throw new Error('Printer is not a network printer');

    const [host, portStr] = printer.connectionDetails.split(':');
    const port = parseInt(portStr ?? '9100', 10);
    const buffer = Buffer.from(data, 'base64');

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => { socket.destroy(); reject(new Error('Network printer timeout')); }, 5000);
      const socket = createConnection(port, host, () => {
        socket.write(buffer, () => {
          socket.end();
          clearTimeout(timeout);
          resolve({ success: true });
        });
      });
      socket.on('error', (err) => { clearTimeout(timeout); reject(err); });
    });
  }
}

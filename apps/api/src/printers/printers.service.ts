import { Injectable, NotFoundException } from '@nestjs/common';
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
}

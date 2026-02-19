import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

interface AddSerialDto {
  itemId: string;
  serialNumber: string;
}

interface RecordSerialDto {
  itemId: string;
  saleId: string;
  serialNumbers: string[];
}

@Injectable()
export class SerialService {
  constructor(private prisma: PrismaService) {}

  async findAll(businessId: string, itemId?: string) {
    return this.prisma.serialRecord.findMany({
      where: {
        item: { businessId },
        ...(itemId ? { itemId } : {}),
      },
      include: {
        item: { select: { id: true, name: true } },
        sale: { select: { id: true, receiptNumber: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  async addSerial(businessId: string, dto: AddSerialDto) {
    const item = await this.prisma.item.findFirst({
      where: { id: dto.itemId, businessId },
    });
    if (!item) throw new BadRequestException('Item not found');

    return this.prisma.serialRecord.create({
      data: {
        itemId: dto.itemId,
        serialNumber: dto.serialNumber,
        status: 'AVAILABLE',
      },
      include: {
        item: { select: { id: true, name: true } },
      },
    });
  }

  async searchSerial(serialNumber: string, businessId: string) {
    return this.prisma.serialRecord.findFirst({
      where: { serialNumber, item: { businessId } },
      include: {
        item: { select: { id: true, name: true } },
        sale: { select: { id: true, receiptNumber: true, createdAt: true } },
      },
    });
  }

  async recordSerials(businessId: string, dto: RecordSerialDto) {
    const item = await this.prisma.item.findFirst({
      where: { id: dto.itemId, businessId },
    });

    if (!item?.trackSerials) {
      throw new BadRequestException('Item does not track serials');
    }

    const records = await Promise.all(
      dto.serialNumbers.map(serial =>
        this.prisma.serialRecord.create({
          data: {
            itemId: dto.itemId,
            saleId: dto.saleId,
            serialNumber: serial,
            status: 'SOLD',
          },
        })
      )
    );

    return records;
  }

  async validateReturn(itemId: string, serialNumber: string) {
    const record = await this.prisma.serialRecord.findFirst({
      where: { itemId, serialNumber, status: 'SOLD' },
    });

    if (!record) {
      throw new BadRequestException('Serial number not found or already returned');
    }

    return record;
  }

  async findBySerial(serialNumber: string, businessId: string) {
    return this.prisma.serialRecord.findFirst({
      where: {
        serialNumber,
        item: { businessId },
      },
      include: { item: true, sale: true },
    });
  }
}

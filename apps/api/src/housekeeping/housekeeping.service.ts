import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const STATUSES = ['PENDING', 'IN_PROGRESS', 'DONE'];

@Injectable()
export class HousekeepingService {
  constructor(private prisma: PrismaService) {}

  async list(businessId: string, status?: string) {
    return this.prisma.housekeepingAssignment.findMany({
      where: { businessId, ...(status ? { status } : {}) },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * The room and the employee must both belong to the caller's business, and the
   * assigner is whoever is signed in. These ids used to be taken from the body
   * as sent, so a request could assign another business's room to anyone.
   */
  async assign(
    dto: { roomId: string; employeeId: string; task?: string; priority?: string; notes?: string },
    businessId: string,
    assignedBy: string,
  ) {
    const [room, employee] = await Promise.all([
      this.prisma.hotelRoom.findFirst({ where: { id: dto.roomId, businessId }, select: { id: true } }),
      this.prisma.employee.findFirst({ where: { id: dto.employeeId, businessId }, select: { id: true } }),
    ]);
    if (!room) throw new NotFoundException('Room not found');
    if (!employee) throw new NotFoundException('Employee not found');
    return this.prisma.housekeepingAssignment.create({
      data: {
        businessId,
        roomId: room.id,
        employeeId: employee.id,
        assignedBy,
        ...(dto.task && { task: dto.task }),
        ...(dto.priority && { priority: dto.priority }),
        ...(dto.notes && { notes: dto.notes }),
      },
    });
  }

  async updateStatus(id: string, status: string, businessId: string) {
    if (!STATUSES.includes(status)) throw new BadRequestException(`Status must be one of ${STATUSES.join(', ')}`);
    const owned = await this.prisma.housekeepingAssignment.findFirst({ where: { id, businessId }, select: { id: true } });
    if (!owned) throw new NotFoundException('Assignment not found');
    const data: { status: string; startedAt?: Date; completedAt?: Date } = { status };
    if (status === 'IN_PROGRESS') data.startedAt = new Date();
    if (status === 'DONE') data.completedAt = new Date();
    return this.prisma.housekeepingAssignment.update({ where: { id }, data });
  }
}

import { BadRequestException, Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Public } from '../auth/jwt-auth.guard';
import { SkipSubscriptionCheck } from '../auth/subscription.guard';

@Controller('nps')
export class NpsController {
  constructor(private prisma: PrismaService) {}

  @Post()
  @Public()
  @SkipSubscriptionCheck()
  async submitNps(@Body() body: { businessId: string; saleId?: string; score: number; comment?: string }) {
    if (body.score < 0 || body.score > 10) throw new BadRequestException('Score must be 0-10');
    return this.prisma.npsResponse.create({
      data: {
        id: require('crypto').randomUUID(),
        businessId: body.businessId,
        saleId: body.saleId,
        score: body.score,
        comment: body.comment,
      },
    });
  }

  @Get()
  async getNps(
    @Query('businessId') businessId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const responses = await this.prisma.npsResponse.findMany({
      where: {
        businessId,
        ...(startDate && { createdAt: { gte: new Date(startDate) } }),
        ...(endDate && { createdAt: { lte: new Date(endDate) } }),
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
    const avg = responses.length ? responses.reduce((s, r) => s + r.score, 0) / responses.length : null;
    const promoters = responses.filter(r => r.score >= 9).length;
    const detractors = responses.filter(r => r.score <= 6).length;
    const npsScore = responses.length ? Math.round(((promoters - detractors) / responses.length) * 100) : null;
    return { responses, avg, npsScore, total: responses.length, promoters, detractors };
  }
}

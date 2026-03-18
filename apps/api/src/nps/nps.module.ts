import { Module } from '@nestjs/common';
import { NpsController } from './nps.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({ imports: [PrismaModule], controllers: [NpsController] })
export class NpsModule {}

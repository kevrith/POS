import { Module } from '@nestjs/common';
import { DisciplinaryService } from './disciplinary.service';
import { DisciplinaryController } from './disciplinary.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [DisciplinaryController],
  providers: [DisciplinaryService],
})
export class DisciplinaryModule {}

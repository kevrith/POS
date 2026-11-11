import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PatientsController } from './patients.controller';
import { PatientsService } from './patients.service';

@Module({
  imports: [PrismaModule],
  providers: [PatientsService],
  controllers: [PatientsController],
  exports: [PatientsService],
})
export class PatientsModule {}

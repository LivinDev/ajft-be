import { Module } from '@nestjs/common';
import { InternshipsService } from './internships.service';
import { InternshipsController } from './internships.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [InternshipsController],  // Only one controller needed
  providers: [InternshipsService],
  exports: [InternshipsService],
})
export class InternshipsModule {}
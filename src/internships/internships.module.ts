import { Module } from '@nestjs/common';
import { InternshipsService } from './internships.service';
import { InternshipsController } from './internships.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [PrismaModule, EmailModule],
  controllers: [InternshipsController],
  providers: [InternshipsService],
  exports: [InternshipsService],
})
export class InternshipsModule {}
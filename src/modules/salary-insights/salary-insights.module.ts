import { Module } from '@nestjs/common';
import { SalaryInsightsService } from './salary-insights.service';
import { SalaryInsightsController } from './salary-insights.controller';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [SalaryInsightsController],
  providers: [SalaryInsightsService],
  exports: [SalaryInsightsService],
})
export class SalaryInsightsModule {}

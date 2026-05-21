import { Module } from '@nestjs/common';
import { MarketDashboardController } from './market-dashboard.controller';
import { MarketDashboardService } from './market-dashboard.service';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [MarketDashboardController],
  providers: [MarketDashboardService],
})
export class MarketDashboardModule {}

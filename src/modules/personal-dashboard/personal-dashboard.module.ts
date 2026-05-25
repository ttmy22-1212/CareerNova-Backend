import { Module } from '@nestjs/common';
import { PersonalDashboardController } from './personal-dashboard.controller';
import { PersonalDashboardService } from './personal-dashboard.service';

@Module({
  controllers: [PersonalDashboardController],
  providers: [PersonalDashboardService],
})
export class PersonalDashboardModule {}

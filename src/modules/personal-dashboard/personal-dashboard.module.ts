import { Module } from '@nestjs/common';
import { PersonalDashboardController } from './personal-dashboard.controller';
import { PersonalDashboardService } from './personal-dashboard.service';
import { MatchingModule } from '../matching/matching.module';

@Module({
  imports: [MatchingModule],
  controllers: [PersonalDashboardController],
  providers: [PersonalDashboardService],
})
export class PersonalDashboardModule {}

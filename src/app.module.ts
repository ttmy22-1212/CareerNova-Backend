import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { EmailModule } from './email/email.module';
import { AuthModule } from './modules/auth/auth.module';
import { ProfileModule } from './modules/profile/profile.module';
import { JobModule } from './modules/job/job.module';
import { CvModule } from './modules/cv/cv.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { SalaryInsightsModule } from './modules/salary-insights/salary-insights.module';
import { MarketDashboardModule } from './modules/market-dashboard/market-dashboard.module';
import { MatchingModule } from './modules/matching/matching.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    EmailModule,
    AuthModule,
    ProfileModule,
    JobModule,
    CvModule,
    DashboardModule,
    SalaryInsightsModule,
    MarketDashboardModule,
    MatchingModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

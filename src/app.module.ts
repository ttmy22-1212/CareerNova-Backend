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
import { SalaryInsightsModule } from './modules/salary-insights/salary-insights.module';
import { MarketDashboardModule } from './modules/market-dashboard/market-dashboard.module';
import { MatchingModule } from './modules/matching/matching.module';
import { PersonalDashboardModule } from './modules/personal-dashboard/personal-dashboard.module';
import { SkillGapModule } from './modules/skill-gap/skill-gap.module';
import { RecommendationModule } from './modules/recommendation/recommendation.module';
import { LearningRoadmapModule } from './modules/learning-roadmap/learning-roadmap.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    EmailModule,
    AuthModule,
    ProfileModule,
    JobModule,
    CvModule,
    SalaryInsightsModule,
    MarketDashboardModule,
    MatchingModule,
    PersonalDashboardModule,
    SkillGapModule,
    RecommendationModule,
    LearningRoadmapModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

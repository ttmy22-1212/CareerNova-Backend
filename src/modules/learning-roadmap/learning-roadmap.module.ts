import { Module } from '@nestjs/common';
import { LearningRoadmapController } from './learning-roadmap.controller';
import { LearningRoadmapService } from './learning-roadmap.service';

@Module({
  controllers: [LearningRoadmapController],
  providers: [LearningRoadmapService],
})
export class LearningRoadmapModule {}

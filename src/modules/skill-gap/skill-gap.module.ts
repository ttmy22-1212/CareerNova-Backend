import { Module } from '@nestjs/common';
import { SkillGapController } from './skill-gap.controller';
import { SkillGapService } from './skill-gap.service';

@Module({
  controllers: [SkillGapController],
  providers: [SkillGapService],
})
export class SkillGapModule {}

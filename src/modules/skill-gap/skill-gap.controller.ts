import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { SkillGapService } from './skill-gap.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  SkillGapScoreCardDto,
  SkillGapMissingPercentCardDto,
  SkillGapRadarPointDto,
  SkillGapCategoryBreakdownDto,
} from './dto/skill-gap.dto';
import type { AuthenticatedRequest } from '../auth/interfaces/auth.interface';

@ApiTags('Skill Gap Analysis')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('skill-gap')
export class SkillGapController {
  constructor(private readonly skillGapService: SkillGapService) {}

  @Get('card-score')
  @ApiOperation({ summary: 'Card 1: Điểm số phần trăm độ khớp CV tổng quan' })
  @ApiResponse({ status: 200, type: SkillGapScoreCardDto })
  async getScoreCard(@Req() req: AuthenticatedRequest) {
    const userId = req.user.sub;
    const data = await this.skillGapService.getMatchScoreCard(userId);
    return { data };
  }

  @Get('card-missing-percentage')
  @ApiOperation({
    summary:
      'Card 2: Tỷ lệ % kĩ năng còn thiếu hụt so với tổng số kĩ năng ngành',
  })
  @ApiResponse({ status: 200, type: SkillGapMissingPercentCardDto })
  async getMissingPercentCard(@Req() req: AuthenticatedRequest) {
    const userId = req.user.sub;
    const data = await this.skillGapService.getMissingPercentCard(userId);
    return { data };
  }

  @Get('radar-chart')
  @ApiOperation({
    summary: 'Component 3: Bộ khung dữ liệu vẽ Radar Chart kĩ năng',
  })
  @ApiResponse({ status: 200, type: [SkillGapRadarPointDto] })
  async getRadarChart(@Req() req: AuthenticatedRequest) {
    const userId = req.user.sub;
    const data = await this.skillGapService.getSkillsRadarData(userId);
    return { data };
  }

  @Get('detailed-breakdown')
  @ApiOperation({
    summary: 'Component 4: Bảng phân rã chi tiết danh mục và kĩ năng con',
  })
  @ApiResponse({ status: 200, type: [SkillGapCategoryBreakdownDto] })
  async getDetailedBreakdown(@Req() req: AuthenticatedRequest) {
    const userId = req.user.sub;
    const data = await this.skillGapService.getDetailedBreakdownData(userId);
    return { data };
  }
}

import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { SkillGapService } from './skill-gap.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  SkillGapStatisticsDto,
  CategoryGapDto,
  RadarSkillPointDto,
  CategoryBreakdownDto,
  SkillGapLearningRecommendationDto,
} from './dto/skill-gap.dto';
import type { AuthenticatedRequest } from '../auth/interfaces/auth.interface';

@ApiTags('Skill Gap Analysis')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('skill-gap')
export class SkillGapController {
  constructor(private readonly skillGapService: SkillGapService) {}

  @Get('statistics')
  @ApiOperation({
    summary: 'Lấy dữ liệu các thẻ thống kê tổng quan của trang Skill Gap',
  })
  @ApiResponse({ status: 200, type: SkillGapStatisticsDto })
  async getStatistics(@Req() req: AuthenticatedRequest) {
    const userId = req.user.sub;
    const data = await this.skillGapService.getSkillGapStatistics(userId);
    return { data };
  }

  @Get('category-gaps')
  @ApiOperation({
    summary:
      'Lấy dữ liệu độ khớp theo danh mục kèm danh sách skill chi tiết từ default matching',
  })
  @ApiResponse({ status: 200, type: [CategoryGapDto] })
  async getCategoryGaps(
    @Req() req: AuthenticatedRequest,
    @Query('limit') limit?: string,
  ) {
    const userId = req.user.sub;
    const data = await this.skillGapService.getCategoryGapsData(
      userId,
      Number(limit),
    );
    return { data };
  }

  @Get('learning-paths')
  @ApiOperation({
    summary:
      'Lấy lộ trình học đề xuất theo các skill thiếu/khớp một phần trong default matching',
  })
  @ApiResponse({ status: 200, type: [SkillGapLearningRecommendationDto] })
  async getLearningPaths(
    @Req() req: AuthenticatedRequest,
    @Query('limit') limit?: string,
  ) {
    const userId = req.user.sub;
    const data = await this.skillGapService.getRecommendedLearningPaths(
      userId,
      Number(limit),
    );
    return { data };
  }

  @Get('skills-radar')
  @ApiOperation({
    summary:
      'Lấy dữ liệu biểu đồ Radar lọc theo Category truyền vào (Giống Dashboard)',
  })
  @ApiResponse({ status: 200, type: [RadarSkillPointDto] })
  async getSkillsRadar(
    @Req() req: AuthenticatedRequest,
    @Query('category') category: string,
  ) {
    const userId = req.user.sub;
    const data = await this.skillGapService.getSkillsRadarData(
      userId,
      category,
    );
    return { data };
  }

  @Get('skills-breakdown')
  @ApiOperation({
    summary:
      'Lấy danh sách TOÀN BỘ kỹ năng trải phẳng (Detailed Breakdown) không cần lọc category',
  })
  @ApiResponse({ status: 200, type: [CategoryBreakdownDto] })
  async getSkillsBreakdown(@Req() req: AuthenticatedRequest) {
    const userId = req.user.sub;
    const data = await this.skillGapService.getSkillsBreakdownData(userId);
    return { data };
  }
}

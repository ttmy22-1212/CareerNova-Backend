import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { PersonalDashboardService } from './personal-dashboard.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  DashboardBannerDto,
  DashboardStatisticsDto,
  RecommendedJobDto,
  RadarSkillPointDto,
  CategoryGapDto,
  DashboardProgressDto,
} from './dto/personal-dashboard.dto';
import type { AuthenticatedRequest } from '../auth/interfaces/auth.interface';

@ApiTags('Personal Dashboard')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('personal-dashboard')
export class PersonalDashboardController {
  constructor(private readonly dashboardService: PersonalDashboardService) {}

  @Get('banner')
  @ApiOperation({ summary: 'Lấy thông tin banner chào mừng' })
  @ApiResponse({ status: 200, type: DashboardBannerDto })
  async getBanner(@Req() req: AuthenticatedRequest) {
    const userId = req.user.sub;
    const data = await this.dashboardService.getBanner(userId);
    return { data };
  }

  @Get('statistics')
  @ApiOperation({ summary: 'Lấy dữ liệu các thẻ thống kê tổng quan' })
  @ApiResponse({ status: 200, type: DashboardStatisticsDto })
  async getStatistics(@Req() req: AuthenticatedRequest) {
    const data = await this.dashboardService.getStatistics(req.user.sub);
    return { data };
  }

  @Get('recommended-jobs')
  @ApiOperation({ summary: 'Lấy danh sách việc làm gợi ý (Tab Jobs Gợi Ý)' })
  @ApiResponse({ status: 200, type: [RecommendedJobDto] })
  async getRecommendedJobs(@Req() req: AuthenticatedRequest) {
    const userId = req.user.sub;
    const data = await this.dashboardService.getRecommendedJobs(userId);
    return { data };
  }

  @Get('skills-radar')
  @ApiOperation({
    summary: 'Lấy dữ liệu biểu đồ Radar cụ thể (Tab Kỹ năng - Bên trái)',
  })
  @ApiResponse({ status: 200, type: [RadarSkillPointDto] })
  async getSkillsRadar(@Req() req: AuthenticatedRequest) {
    const userId = req.user.sub;
    const data = await this.dashboardService.getSkillsRadarData(userId);
    return { data };
  }

  @Get('skills-chart')
  @ApiOperation({
    summary:
      'Lấy dữ liệu biểu đồ so sánh kỹ năng theo danh mục (Tab Kỹ năng - Bên phải)',
  })
  @ApiResponse({ status: 200, type: [CategoryGapDto] })
  async getSkillsChart(@Req() req: AuthenticatedRequest) {
    const userId = req.user.sub;
    const data = await this.dashboardService.getSkillsChartData(userId);
    return { data };
  }

  @Get('progress')
  @ApiOperation({ summary: 'Lấy dữ liệu checklist và hoạt động (Tab Tiến độ)' })
  @ApiResponse({ status: 200, type: DashboardProgressDto })
  async getProgress(@Req() req: AuthenticatedRequest) {
    const userId = req.user.sub;
    const data = await this.dashboardService.getProgressData(userId);
    return { data };
  }
}

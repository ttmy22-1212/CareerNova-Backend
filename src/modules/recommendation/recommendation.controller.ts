import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { RecommendationService } from './recommendation.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  CareerPathDto,
  PrioritySkillDto,
  SavedReportItemDto,
} from './dto/recommendation.dto';
import type { AuthenticatedRequest } from '../auth/interfaces/auth.interface';

@ApiTags('Recommendation')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('recommendation')
export class RecommendationController {
  constructor(private readonly recommendationService: RecommendationService) {}

  @Get('priority-skills')
  @ApiOperation({
    summary: 'Lấy danh sách kỹ năng thiếu/khớp một phần cần ưu tiên phát triển',
  })
  @ApiResponse({ status: 200, type: [PrioritySkillDto] })
  async getPrioritySkills(
    @Req() req: AuthenticatedRequest,
    @Query('limit') limit?: number,
  ) {
    const userId = req.user.sub;
    const data = await this.recommendationService.getPrioritySkills(
      userId,
      limit,
    );
    return { data };
  }

  @Get('career-paths')
  @ApiOperation({
    summary: 'Lấy danh sách hướng nghề đề xuất dựa trên CV và báo cáo so khớp',
  })
  @ApiResponse({ status: 200, type: [CareerPathDto] })
  async getCareerPaths(
    @Req() req: AuthenticatedRequest,
    @Query('limit') limit?: number,
  ) {
    const userId = req.user.sub;
    const data = await this.recommendationService.getCareerPaths(
      userId,
      limit,
    );
    return { data };
  }

  @Get('saved-reports')
  @ApiOperation({
    summary:
      'Lấy danh sách tất cả các lượt so khớp (Báo cáo) đã thực hiện bấm lưu để xem trực tiếp',
  })
  @ApiResponse({ status: 200, type: [SavedReportItemDto] })
  async getSavedReports(@Req() req: AuthenticatedRequest) {
    const userId = req.user.sub;
    const data = await this.recommendationService.getSavedReportsList(userId);
    return { data };
  }
}

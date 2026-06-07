import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  Req,
  Query,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { MatchingService } from './matching.service';
import type { AuthenticatedRequest } from '../auth/interfaces/auth.interface';
import {
  AnalyzeCvDto,
  CheckHistoryResponseDto,
  CvJobMatchResultDto,
  GetRadarCategoryQueryDto,
  MatchCategoryResponseDto,
  RadarCategoryResponseDto,
} from './dto/matching.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('CV Matching')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('matching')
export class MatchingController {
  constructor(private readonly matchingService: MatchingService) {}

  @Get('job-groups')
  @ApiOperation({
    summary: 'Lấy danh sách các nhóm công việc mục tiêu (Role Benchmark)',
  })
  @ApiResponse({ status: 200, type: [String] })
  async getJobGroups() {
    const data = await this.matchingService.getJobGroups();
    return { data };
  }

  @Get('check-history')
  @ApiOperation({
    summary:
      'Kiểm tra xem ứng viên hiện tại đã từng thực hiện đối sánh CV chưa',
  })
  @ApiResponse({ status: 200, type: CheckHistoryResponseDto })
  async checkHistory(@Req() req: AuthenticatedRequest) {
    const userId = req.user.sub;
    const data = await this.matchingService.checkHistory(userId);
    return { data };
  }

  @Post('analyze')
  @ApiOperation({
    summary: 'Kích hoạt thuật toán đối sánh CV ',
  })
  @ApiResponse({
    status: 201,
    description: 'Phân tích và lưu kết quả thành công',
  })
  async analyzeCv(@Body() dto: AnalyzeCvDto, @Req() req: AuthenticatedRequest) {
    const data = await this.matchingService.analyzeCv(dto, req.user.sub);
    return { data };
  }

  @Get('history')
  @ApiOperation({
    summary: 'Lấy tất cả lịch sử đối sánh CV của người dùng hiện tại',
  })
  @ApiResponse({
    status: 200,
    description: 'Danh sách lịch sử đối sánh thành công',
    type: [CvJobMatchResultDto],
  })
  async getAllMatches(@Req() req: AuthenticatedRequest) {
    const userId = req.user.sub;
    const data = await this.matchingService.getAllMatches(userId);
    return { data };
  }

  @Get('history/:match_id')
  @ApiOperation({
    summary: 'Lấy chi tiết kết quả đối sánh CV đã thực hiện theo ID',
  })
  @ApiResponse({
    status: 200,
    description:
      'Trả về chi tiết kết quả đối sánh bao gồm radar_data và gap_report',
  })
  async getMatchDetail(@Param('match_id') matchId: string) {
    const data = await this.matchingService.getMatchDetail(matchId);
    return { data };
  }

  @Get('history/:match_id/categories')
  @ApiOperation({
    summary:
      'Lấy tất cả các category trong hệ thống và trạng thái có trong lượt match không',
  })
  @ApiResponse({ status: 200, type: [MatchCategoryResponseDto] })
  async getMatchCategories(@Param('match_id') matchId: string) {
    const data = await this.matchingService.getMatchCategories(matchId);
    return { data };
  }

  @Get('history/:match_id/radar')
  @ApiOperation({
    summary: 'Lấy dữ liệu radar chi tiết đã được lọc theo một category cụ thể',
  })
  @ApiResponse({
    status: 200,
    type: RadarCategoryResponseDto,
    description:
      'Trả về mảng kỹ năng đã lọc theo category (cấu trúc giống radar_data gốc)',
  })
  async getRadarByCategory(
    @Param('match_id') matchId: string,
    @Query() query: GetRadarCategoryQueryDto,
  ) {
    const data = await this.matchingService.getRadarByCategory(
      matchId,
      query.category,
    );
    return { data };
  }
}

import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { LearningRoadmapService } from './learning-roadmap.service';
import {
  LearningRoadmapFilterDto,
  LearningRoadmapResponseDto,
  SavedCourseActionDto,
} from './dto/learning-roadmap.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthenticatedRequest } from '../auth/interfaces/auth.interface';

@ApiTags('Learning Roadmap')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('learning-roadmap')
export class LearningRoadmapController {
  constructor(private readonly roadmapService: LearningRoadmapService) {}

  @Get()
  @ApiOperation({ summary: 'Lấy danh sách lộ trình và khóa học gợi ý' })
  @ApiResponse({ status: 200, type: LearningRoadmapResponseDto })
  async getRoadmap(
    @Query() filters: LearningRoadmapFilterDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.roadmapService.getRoadmap(filters, req.user.sub);
  }

  @Post('toggle-save')
  @ApiOperation({ summary: 'Lưu hoặc hủy lưu (Bookmark) một khóa học' })
  @ApiResponse({ status: 201, description: 'Trả về trạng thái lưu mới' })
  async toggleSaveCourse(
    @Body() dto: SavedCourseActionDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.roadmapService.toggleSaveCourse(dto.course_id, req.user.sub);
  }
}

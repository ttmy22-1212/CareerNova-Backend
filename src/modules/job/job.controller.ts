import {
  Controller,
  Get,
  Param,
  Query,
  HttpStatus,
  UseGuards,
  Req,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { JobService } from './job.service';
import { GetJobsQueryDto } from './dto/get-jobs-query.dto';
import { GetJobsResponseDto } from './dto/job-response.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GetSkillsQueryDto } from './dto/get-skills-query.dto';
import { GetSkillsResponseDto } from './dto/skill-response.dto';
import type { AuthenticatedRequest } from '../auth/interfaces/auth.interface';

@ApiTags('Jobs')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('jobs')
export class JobController {
  constructor(private readonly jobService: JobService) {}

  @Get()
  @ApiOperation({ summary: 'Lấy danh sách công việc (Yêu cầu đăng nhập)' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Danh sách công việc kèm match_score nếu có cv_id.',
    type: GetJobsResponseDto,
  })
  async findAll(
    @Req() req: AuthenticatedRequest,
    @Query() query: GetJobsQueryDto,
  ) {
    return await this.jobService.findAll(req.user.sub, query);
  }

  @Get('skills')
  @ApiOperation({ summary: 'Lấy danh sách kỹ năng (Yêu cầu đăng nhập)' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Danh sách kỹ năng.',
    type: GetSkillsResponseDto,
  })
  async getSkills(@Query() query: GetSkillsQueryDto) {
    return await this.jobService.getSkills(query);
  }

  @Get('categories')
  @ApiOperation({
    summary: 'Lấy danh sách tất cả các danh mục kỹ năng (Unique Categories)',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description:
      'Danh sách các danh mục kỹ năng độc nhất dưới dạng mảng chuỗi.',
    type: [String],
  })
  async getCategories() {
    return await this.jobService.getCategories();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Lấy chi tiết một công việc' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Thông tin chi tiết công việc và phân tích kỹ năng.',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'RESOURCE_NOT_FOUND',
  })
  async findOne(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Query('cv_id') cvId?: string,
  ) {
    return await this.jobService.findOne(req.user.sub, id, cvId);
  }
}

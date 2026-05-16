import {
  Controller,
  Get,
  Param,
  Query,
  HttpStatus,
  UseGuards,
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

@ApiTags('Jobs')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('jobs')
export class JobController {
  constructor(private readonly jobService: JobService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Lấy danh sách công việc (Yêu cầu đăng nhập)' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Danh sách công việc kèm match_score nếu có cv_id.',
    type: GetJobsResponseDto,
  })
  async findAll(@Query() query: GetJobsQueryDto) {
    return await this.jobService.findAll(query);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Lấy chi tiết một công việc' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Thông tin chi tiết công việc và phân tích kỹ năng.',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'RESOURCE_NOT_FOUND',
  })
  async findOne(@Param('id') id: string, @Query('cv_id') cvId?: string) {
    return await this.jobService.findOne(id, cvId);
  }
}

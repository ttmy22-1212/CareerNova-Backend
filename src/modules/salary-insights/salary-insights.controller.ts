import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { SalaryInsightsService } from './salary-insights.service';
import {
  SalarySummaryDto,
  SalaryByRoleDto,
  SalaryByLocationDto,
  SalaryBySkillDto,
  SalaryFilterDto,
  SalaryTrendDto,
} from './dto/salary-insights.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('Salary Insights')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('salary-insights')
export class SalaryInsightsController {
  constructor(private readonly salaryService: SalaryInsightsService) {}

  @Get('summary')
  @ApiOperation({ summary: 'Thống kê lương tổng quan thị trường' })
  @ApiResponse({ status: 200, type: SalarySummaryDto })
  async getSummary(@Query() filters: SalaryFilterDto) {
    const data = await this.salaryService.getSummary(filters);
    return { data };
  }

  @Get('by-role')
  @ApiOperation({ summary: 'Thống kê lương theo vị trí công việc' })
  @ApiResponse({ status: 200, type: [SalaryByRoleDto] })
  async getByRole(@Query() filters: SalaryFilterDto) {
    const data = await this.salaryService.getByRole(filters);
    return { data };
  }

  @Get('by-location')
  @ApiOperation({ summary: 'Thống kê lương theo địa điểm' })
  @ApiResponse({ status: 200, type: [SalaryByLocationDto] })
  async getByLocation(@Query() filters: SalaryFilterDto) {
    const data = await this.salaryService.getByLocation(filters);
    return { data };
  }

  @Get('by-skill')
  @ApiOperation({ summary: 'Thống kê lương theo kỹ năng' })
  @ApiResponse({ status: 200, type: [SalaryBySkillDto] })
  async getBySkill(@Query() filters: SalaryFilterDto) {
    const data = await this.salaryService.getBySkill(filters);
    return { data };
  }

  @Get('trend')
  @ApiOperation({
    summary:
      'Lấy biến động lương theo cấp bậc công việc trong 6 tháng gần nhất',
  })
  @ApiResponse({ status: 200, type: [SalaryTrendDto] })
  async getTrend(@Query() filters: SalaryFilterDto) {
    const data = await this.salaryService.getTrend(filters);
    return { data };
  }
}

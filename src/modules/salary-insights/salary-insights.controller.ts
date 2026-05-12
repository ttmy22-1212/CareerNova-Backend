import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { SalaryInsightsService } from './salary-insights.service';
import {
  SalarySummaryDto,
  SalaryByRoleDto,
  SalaryByLocationDto,
  SalaryBySkillDto,
} from './dto/salary-insights.dto';

@ApiTags('Salary Insights')
@Controller('salary-insights')
export class SalaryInsightsController {
  constructor(private readonly salaryService: SalaryInsightsService) {}

  @Get('summary')
  @ApiOperation({ summary: 'Thống kê lương tổng quan thị trường' })
  @ApiResponse({ status: 200, type: SalarySummaryDto })
  async getSummary() {
    const data = await this.salaryService.getSummary();
    return { data };
  }

  @Get('by-role')
  @ApiOperation({ summary: 'Thống kê lương theo vị trí công việc' })
  @ApiResponse({ status: 200, type: [SalaryByRoleDto] })
  async getByRole() {
    const data = await this.salaryService.getByRole();
    return { data };
  }

  @Get('by-location')
  @ApiOperation({ summary: 'Thống kê lương theo địa điểm' })
  @ApiResponse({ status: 200, type: [SalaryByLocationDto] })
  async getByLocation() {
    const data = await this.salaryService.getByLocation();
    return { data };
  }

  @Get('by-skill')
  @ApiOperation({ summary: 'Thống kê lương theo kỹ năng' })
  @ApiResponse({ status: 200, type: [SalaryBySkillDto] })
  async getBySkill() {
    const data = await this.salaryService.getBySkill();
    return { data };
  }
}

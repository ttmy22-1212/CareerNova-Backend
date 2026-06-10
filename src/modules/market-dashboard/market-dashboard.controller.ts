import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { MarketDashboardService } from './market-dashboard.service';
import { DashboardFilterDto } from './dto/dashboard-filter.dto';
import { DashboardFiltersOptionsResponseDto } from './dto/dashboard-filters-options-response.dto';
import { StatsCardResponseDto } from './dto/stats-response.dto';
import { JobPostingTrendsResponseDto } from './dto/trends-response.dto';
import { IndustryBreakdownResponseDto } from './dto/industries-response.dto';
import { HotJobsResponseDto } from './dto/hot-jobs-response.dto';
import { SalaryRangesResponseDto } from './dto/salary-ranges-response.dto';
import { InDemandSkillsResponseDto } from './dto/in-demand-skills-response.dto';
import { RisingSkillsResponseDto } from './dto/rising-skills-response.dto';

@ApiTags('Market Dashboard')
@Controller('dashboard')
export class MarketDashboardController {
  constructor(private readonly dashboardService: MarketDashboardService) {}

  @Get('filters')
  @ApiOperation({
    summary:
      'Lấy danh sách các tùy chọn dữ liệu động cho bộ lọc (Dropdown Options)',
  })
  @ApiResponse({ status: 200, type: DashboardFiltersOptionsResponseDto })
  async getDashboardFiltersOptions() {
    const data = await this.dashboardService.getFiltersOptions();
    return { data };
  }

  @Get('stats')
  @ApiOperation({ summary: 'Thống kê số liệu tổng quan (4 Stats Cards)' })
  @ApiResponse({ status: 200, type: StatsCardResponseDto })
  async getStats(@Query() filters: DashboardFilterDto) {
    const data = await this.dashboardService.getStats(filters);
    return { data };
  }

  @Get('trends')
  @ApiOperation({
    summary:
      'Phân tích xu hướng tuyển dụng & làm việc từ xa (Job Posting Trends)',
  })
  @ApiResponse({ status: 200, type: JobPostingTrendsResponseDto })
  async getTrends(@Query() filters: DashboardFilterDto) {
    const data = await this.dashboardService.getTrends(filters);
    return { data };
  }

  @Get('industries')
  @ApiOperation({
    summary: 'Cơ cấu tỷ lệ tuyển dụng theo category công việc',
  })
  @ApiResponse({ status: 200, type: [IndustryBreakdownResponseDto] })
  async getIndustryBreakdown(@Query() filters: DashboardFilterDto) {
    const data = await this.dashboardService.getIndustryBreakdown(filters);
    return { data };
  }

  @Get('hot-jobs')
  @ApiOperation({
    summary: 'Danh sách Top 5 vị trí công việc hot nhất tuần (Top 5 Hot Jobs)',
  })
  @ApiResponse({ status: 200, type: [HotJobsResponseDto] })
  async getHotJobs(@Query() filters: DashboardFilterDto) {
    const data = await this.dashboardService.getHotJobs(filters);
    return { data };
  }

  @Get('salary-ranges')
  @ApiOperation({
    summary:
      'Dải phân bố lương Min-Max theo vị trí công việc gộp All Levels (Salary Ranges)',
  })
  @ApiResponse({ status: 200, type: [SalaryRangesResponseDto] })
  async getSalaryRanges(@Query() filters: DashboardFilterDto) {
    const data = await this.dashboardService.getSalaryRanges(filters);
    return { data };
  }

  @Get('skills/in-demand')
  @ApiOperation({
    summary:
      'Top 10 kỹ năng được nhà tuyển dụng săn đón nhiều nhất (Top 10 In-Demand Skills)',
  })
  @ApiResponse({ status: 200, type: [InDemandSkillsResponseDto] })
  async getInDemandSkills(@Query() filters: DashboardFilterDto) {
    const data = await this.dashboardService.getInDemandSkills(filters);
    return { data };
  }

  @Get('skills/rising')
  @ApiOperation({
    summary:
      'Top kỹ năng bứt phá có tốc độ tăng trưởng đột biến (Rising Skills)',
  })
  @ApiResponse({ status: 200, type: [RisingSkillsResponseDto] })
  async getRisingSkills(@Query() filters: DashboardFilterDto) {
    const data = await this.dashboardService.getRisingSkills(filters);
    return { data };
  }
}

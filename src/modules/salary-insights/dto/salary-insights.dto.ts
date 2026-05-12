import { ApiProperty } from '@nestjs/swagger';

export class SalarySummaryDto {
  @ApiProperty() average_salary: number;
  @ApiProperty() median_salary: number;
  @ApiProperty() percentile_75: number;
  @ApiProperty() open_jobs_count: number;
}

export class SalaryByRoleDto {
  @ApiProperty() role: string;
  @ApiProperty() min_salary: number;
  @ApiProperty() avg_salary: number;
  @ApiProperty() max_salary: number;
  @ApiProperty() sample_count: number;
}

export class SalaryByLocationDto {
  @ApiProperty() location: string;
  @ApiProperty() avg_salary: number;
  @ApiProperty() job_count: number;
}

export class SalaryBySkillDto {
  @ApiProperty() skill_id: number;
  @ApiProperty() skill_name: string;
  @ApiProperty() avg_salary: number;
  @ApiProperty() job_count: number;
}

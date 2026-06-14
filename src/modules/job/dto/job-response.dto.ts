import { ApiProperty } from '@nestjs/swagger';

class CompanySimpleDto {
  @ApiProperty({ example: '123456789' })
  company_id: string;

  @ApiProperty({ example: 'TechCorp' })
  name: string;
}

class SalaryDto {
  @ApiProperty({ example: '1000.00' })
  min_salary: string | null;

  @ApiProperty({ example: '1500.00' })
  med_salary: string | null;

  @ApiProperty({ example: '2000.00' })
  max_salary: string | null;

  @ApiProperty({ example: 'VND' })
  currency: string;

  @ApiProperty({ example: 'monthly', nullable: true })
  pay_period: string | null;
}

class JobSkillDto {
  @ApiProperty({ example: 1 })
  skill_id: number;

  @ApiProperty({ example: 'React' })
  skill_name: string;

  @ApiProperty({ example: false })
  is_inferred: boolean;
}

export class JobItemDto {
  @ApiProperty({ example: '1001' })
  job_id: string;

  @ApiProperty({ example: 'Senior React Developer' })
  title: string;

  @ApiProperty()
  company: CompanySimpleDto;

  @ApiProperty({ example: 'HCM' })
  location: string | null;

  @ApiProperty({ example: 'Full-time' })
  work_type: string | null;

  @ApiProperty({ example: 'Senior' })
  formatted_experience_level: string | null;

  @ApiProperty()
  listed_time: Date;

  @ApiProperty({ type: SalaryDto, nullable: true })
  salary: SalaryDto | null;

  @ApiProperty({ type: [JobSkillDto] })
  skills: JobSkillDto[];

  @ApiProperty({
    example: 'https://www.linkedin.com/jobs/view/123',
    nullable: true,
  })
  job_posting_url: string | null;

  @ApiProperty({ example: 82.5, nullable: true })
  match_score: number | null;

  @ApiProperty({ example: false, nullable: true })
  is_saved: boolean | null;
}

export class GetJobsResponseDto {
  @ApiProperty({ type: [JobItemDto] })
  data: JobItemDto[];

  @ApiProperty()
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

import { ApiProperty } from '@nestjs/swagger';

export class RecommendedJobDto {
  @ApiProperty({ example: '123456789' })
  job_id: string;

  @ApiProperty({ example: 'Senior React Developer' })
  title: string;

  @ApiProperty({ example: 'TechCorp Solutions' })
  company_name: string;

  @ApiProperty({ example: 'Ho Chi Minh' })
  location: string;

  @ApiProperty({ example: '85% match' })
  match_rate: string;

  @ApiProperty({ example: '1000 - 1500 USD' })
  salary_text: string;
}

export class SavedReportItemDto {
  @ApiProperty({ example: '6e368daa-075f-466f-ba1e-4e4fade5b42a' })
  match_id: string;

  @ApiProperty({
    example: 'CV Match — Senior Frontend Dev',
    description: 'Tên hiển thị phân loại luồng report',
  })
  report_name: string;

  @ApiProperty({ example: 'cv_job', enum: ['cv_job', 'role_benchmark'] })
  match_type: string;

  @ApiProperty({ example: 85 })
  match_score: number;

  @ApiProperty({ example: '2026-05-25T15:30:00.000Z' })
  created_at: Date | null;

  @ApiProperty({ example: '6e368daa-075f-466f-ba1e-4e4fade5b42a' })
  cv_id: string;
}

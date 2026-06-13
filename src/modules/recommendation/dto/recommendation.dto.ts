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

export class PrioritySkillDto {
  @ApiProperty({ example: 42 })
  skill_id: number;

  @ApiProperty({ example: 'Docker' })
  skill_name: string;

  @ApiProperty({ example: 'DevOps & Cloud', nullable: true })
  category: string | null;

  @ApiProperty({ example: 'Missing', enum: ['Missing', 'Partial'] })
  status: 'Missing' | 'Partial';

  @ApiProperty({
    example: 'high',
    enum: ['critical', 'high', 'medium', 'low'],
  })
  priority: 'critical' | 'high' | 'medium' | 'low';

  @ApiProperty({ example: 0.42 })
  weight: number;

  @ApiProperty({ example: 0.35 })
  similarity: number;

  @ApiProperty({ example: 128 })
  job_count: number;

  @ApiProperty({ example: '128 công việc đang yêu cầu kỹ năng này' })
  reason: string;

  @ApiProperty({ example: 'Có thể mở thêm 128 cơ hội phù hợp hơn' })
  impact: string;

  @ApiProperty({ example: '1-2 tháng' })
  timeframe: string;
}

export class CareerPathSkillGapDto {
  @ApiProperty({ example: 42 })
  skill_id: number;

  @ApiProperty({ example: 'Docker' })
  skill_name: string;

  @ApiProperty({ example: 'DevOps & Cloud', nullable: true })
  category: string | null;

  @ApiProperty({
    example: 'high',
    enum: ['critical', 'high', 'medium', 'low'],
  })
  priority: 'critical' | 'high' | 'medium' | 'low';
}

export class CareerPathDto {
  @ApiProperty({ example: 'backend_developer' })
  id: string;

  @ApiProperty({ example: 'Backend Developer' })
  title: string;

  @ApiProperty({ example: 'backend_developer' })
  search_group: string;

  @ApiProperty({ example: 68 })
  current_match: number;

  @ApiProperty({ example: 85 })
  target_match: number;

  @ApiProperty({ example: 'Cần bổ sung trọng tâm' })
  readiness_label: string;

  @ApiProperty({ example: '1-2 tháng' })
  time_to_ready: string;

  @ApiProperty({ type: [CareerPathSkillGapDto] })
  skill_gaps: CareerPathSkillGapDto[];

  @ApiProperty({ example: '18,000,000 - 30,000,000 VND' })
  salary_range: string;

  @ApiProperty({ example: 128 })
  openings_count: number;

  @ApiProperty({ example: 'Backend Foundation', nullable: true })
  learning_path_title: string | null;

  @ApiProperty({ example: '6e368daa-075f-466f-ba1e-4e4fade5b42a', nullable: true })
  learning_path_id: string | null;

  @ApiProperty({ example: '/skill-gap' })
  href: string;
}

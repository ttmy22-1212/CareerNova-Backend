import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class DashboardBannerDto {
  @ApiProperty({
    example: 78,
    description: 'Điểm so khớp mặc định của người dùng',
  })
  match_score: number;

  @ApiProperty({
    example: 12,
    description: 'Số lượng job phù hợp trong search group đạt điểm mong muốn',
  })
  suitable_jobs_count: number;
}

export class DashboardStatisticsDto {
  @ApiProperty({ example: 78, description: 'Phần trăm độ khớp công việc' })
  match_score: number;

  @ApiProperty({ example: 4, description: 'Số lượng kỹ năng cần cải thiện' })
  missing_skills_count: number;

  @ApiProperty({ example: 100, description: 'Phần trăm hoàn thiện hồ sơ' })
  profile_completion_percentage: number;
}

export class SkillDetailLineDto {
  @ApiProperty({ example: 'Docker', description: 'Tên kỹ năng' })
  skill_name: string;

  @ApiProperty({
    example: 'Missing',
    description: 'Trạng thái: Proficient hoặc Missing',
  })
  status: string;

  @ApiProperty({
    example: 75,
    description: 'Mức độ yêu cầu của thị trường (%)',
  })
  market_rate: number;

  @ApiProperty({ example: 0, description: 'Mức độ hiện tại của User (%)' })
  user_rate: number;
}

export class CategoryGapDto {
  @ApiProperty({ example: 'DevOps', description: 'Tên danh mục' })
  category: string;

  @ApiProperty({
    example: -4.5,
    description: 'Điểm chênh lệch (Âm là thiếu, Dương là dư)',
  })
  gap_score: number;
}

export class RecommendedJobDto {
  @ApiProperty({ example: '123456789', description: 'ID của công việc' })
  job_id: string;

  @ApiProperty({
    example: 'Senior React Developer',
    description: 'Tiêu đề công việc',
  })
  title: string;

  @ApiProperty({ example: 'TechCorp Solutions', description: 'Tên công ty' })
  company_name: string;

  @ApiProperty({ example: 'Ho Chi Minh', description: 'Địa điểm làm việc' })
  location: string;

  @ApiProperty({
    example: '85%',
    description: 'Tỷ lệ so khớp hiển thị trên UI',
  })
  match_rate: string;

  @ApiProperty({
    example: '1000 - 1500 USD',
    description: 'Mức lương hiển thị',
  })
  salary_text: string;
}

export class SkillsOverviewDto {
  @ApiProperty({ example: {}, description: 'Dữ liệu JSON vẽ biểu đồ radar' })
  radar_data: any;

  @ApiProperty({
    example: ['AWS', 'Docker'],
    description: 'Danh sách rút gọn kỹ năng đang thiếu',
  })
  top_missing_skills: string[];
}

export class ProfileStepDto {
  @ApiProperty({ example: 'Chọn ngành học & trường', description: 'Tên bước' })
  step_name: string;

  @ApiProperty({ example: true, description: 'Trạng thái hoàn thành' })
  is_completed: boolean;
}

export class RecentActivityDto {
  @ApiProperty({
    example: 'CV analyzed',
    description: 'Tên hoạt động: CV uploaded hoặc CV analyzed',
  })
  activity_name: string;

  @ApiProperty({
    example: '2026-05-25T15:30:00.000Z',
    description: 'Thời gian thực hiện gần nhất',
  })
  recorded_at: Date | null;
}

export class JourneyStageDto {
  @ApiProperty({ example: 'explore', description: 'ID của bước hành trình' })
  id: string;

  @ApiProperty({ example: 'Khám phá', description: 'Tên bước' })
  label: string;

  @ApiProperty({
    example: 'Xác định ngành & định hướng',
    description: 'Mô tả bước',
  })
  desc: string;

  @ApiPropertyOptional({
    example: 66,
    description: 'Trường legacy. UI hiện tại không hiển thị phần trăm.',
  })
  progress?: number;

  @ApiProperty({ example: false, description: 'Đã hoàn thành chưa' })
  done: boolean;

  @ApiProperty({
    example: '/onboarding/welcome',
    description: 'Đường dẫn tới tính năng',
  })
  href: string;
}

export class JourneyProgressDto {
  @ApiProperty({
    type: [JourneyStageDto],
    description: 'Danh sách trạng thái 4 bước hành trình',
  })
  stages: JourneyStageDto[];

  @ApiPropertyOptional({
    example: 58,
    description: 'Trường legacy. UI hiện tại không hiển thị tổng phần trăm.',
  })
  overall?: number;
}

export class DashboardProgressDto {
  @ApiProperty({
    example: 100,
    description: 'Phần trăm hoàn thiện hồ sơ tổng quan',
  })
  profile_completion_percentage: number;

  @ApiProperty({
    type: [ProfileStepDto],
    description: 'Danh sách checklist các bước bên trái',
  })
  checklist: ProfileStepDto[];

  @ApiProperty({
    type: [RecentActivityDto],
    description: '2 hoạt động gần đây bên phải',
  })
  recent_activities: RecentActivityDto[];
}

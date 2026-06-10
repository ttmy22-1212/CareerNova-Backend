import { ApiProperty } from '@nestjs/swagger';

export class SkillGapStatisticsDto {
  @ApiProperty({ example: 78, description: 'Độ khớp CV tổng quan (%)' })
  match_score: number;

  @ApiProperty({
    example: 3,
    description: 'Số kỹ năng thiếu hụt mức độ Cốt lõi (Trọng số > 50%)',
  })
  core_gaps_count: number;

  @ApiProperty({
    example: 5,
    description: 'Số kỹ năng thiếu hụt mức độ Ưu tiên (Trọng số 20% - 50%)',
  })
  priority_gaps_count: number;
}

export class CategoryGapSkillDto {
  @ApiProperty({ example: 101 })
  skill_id: number;

  @ApiProperty({ example: 'React' })
  skill_name: string;

  @ApiProperty({ example: 0.15, description: 'Trọng số skill trong category' })
  weight: number;

  @ApiProperty({
    example: 85,
    description: 'Mức độ hiện tại của bạn so với yêu cầu skill (%)',
  })
  user_rate: number;

  @ApiProperty({
    example: 100,
    description: 'Mốc yêu cầu thị trường của skill (%)',
  })
  market_rate: number;

  @ApiProperty({
    example: 0.85,
    description: 'Similarity đã chuẩn hóa từ matching',
  })
  similarity: number;

  @ApiProperty({ example: 85, description: 'Điểm khớp có dấu của skill' })
  gap_score: number;

  @ApiProperty({
    example: 'Matched',
    enum: ['Matched', 'Partial', 'Missing'],
  })
  status: 'Matched' | 'Partial' | 'Missing';

  @ApiProperty({ example: 'Docker', required: false })
  matched_via?: string;
}

export class CategoryGapDto {
  @ApiProperty({ example: 'Backend Development' })
  category: string;

  @ApiProperty({
    example: -67.5,
    description:
      'Điểm khớp có dấu của category theo trọng số skill trong default matching (-100 đến 100)',
  })
  gap_score: number;

  @ApiProperty({
    example: '+67.5pt',
    description: 'Chuỗi hiển thị điểm khớp category trên UI',
  })
  gap_label: string;

  @ApiProperty({
    example: 72,
    description: 'Tỷ lệ năng lực hiện tại trung bình theo trọng số (%)',
  })
  user_rate_avg: number;

  @ApiProperty({
    example: 100,
    description: 'Mốc yêu cầu thị trường trung bình (%)',
  })
  market_rate_avg: number;

  @ApiProperty({
    type: [CategoryGapSkillDto],
    description: 'Danh sách skill thuộc category trong default matching',
  })
  skills: CategoryGapSkillDto[];
}

export class RadarSkillPointDto {
  @ApiProperty({ example: 'Docker' })
  skill_name: string;

  @ApiProperty({ example: 80, description: 'Điểm thị trường yêu cầu (%)' })
  market_score: number;

  @ApiProperty({ example: 20, description: 'Điểm User hiện có (%)' })
  user_score: number;
}

export class SkillBreakdownItemDto {
  @ApiProperty({ example: 101 })
  skill_id: number;

  @ApiProperty({ example: 'React' })
  skill_name: string;

  @ApiProperty({ example: 92, description: 'Mức độ hiện tại của Bạn (%)' })
  user_rate: number;

  @ApiProperty({
    example: 75,
    description: 'Mức độ yêu cầu của Thị trường (%)',
  })
  market_rate: number;

  @ApiProperty({ example: 'Proficient', enum: ['Proficient', 'Missing'] })
  status: 'Proficient' | 'Missing';
}

// --- CẤU TRÚC CHO DANH MỤC CHA (HÀNG ĐỘNG TRÊN UI) ---
export class CategoryBreakdownDto {
  @ApiProperty({ example: 'Frontend' })
  category_name: string;

  @ApiProperty({
    example: '-13pt gap',
    description: 'Chuỗi hiển thị điểm gap trên nhãn UI',
  })
  gap_label: string;

  @ApiProperty({
    example: 88,
    description: 'Tỷ lệ trung bình hiện tại của Bạn (%)',
  })
  user_rate_avg: number;

  @ApiProperty({
    example: 75,
    description: 'Tỷ lệ trung bình của Thị trường (%)',
  })
  market_rate_avg: number;

  @ApiProperty({
    type: [SkillBreakdownItemDto],
    description: 'Danh sách kỹ năng con khi bấm mở rộng',
  })
  skills: SkillBreakdownItemDto[];
}

export class SkillGapLearningCourseDto {
  @ApiProperty({ example: 'uuid-course-id' })
  id: string;

  @ApiProperty({ example: 'AWS Cloud Practitioner Essentials' })
  title: string;

  @ApiProperty({ example: 'Coursera' })
  provider: string;

  @ApiProperty({ example: '12h' })
  duration: string;

  @ApiProperty({ example: 'Intermediate' })
  level: string;

  @ApiProperty({ example: 4.7 })
  rating: number;

  @ApiProperty({ example: 85000 })
  learners: number;

  @ApiProperty({ example: 0 })
  price: number;

  @ApiProperty({ example: false })
  is_saved: boolean;

  @ApiProperty({ example: 100 })
  progress: number;

  @ApiProperty({ example: ['AWS', 'Cloud'] })
  skills: string[];

  @ApiProperty({ example: '📘' })
  image: string;

  @ApiProperty({ required: false })
  source_url?: string;
}

export class SkillGapLearningPathDetailDto {
  @ApiProperty({ example: 'uuid-path-id' })
  id: string;

  @ApiProperty({ example: 'Backend API Development Path' })
  title: string;

  @ApiProperty()
  description: string;

  @ApiProperty({ example: '2 months' })
  duration: string;

  @ApiProperty({ example: 'Intermediate' })
  difficulty: string;

  @ApiProperty({ example: '🚀' })
  icon: string;

  @ApiProperty({ type: [SkillGapLearningCourseDto] })
  courses: SkillGapLearningCourseDto[];
}

export class SkillGapLearningRecommendationDto {
  @ApiProperty({ example: 'docker' })
  id: string;

  @ApiProperty({ example: 'Docker' })
  skill_name: string;

  @ApiProperty({ example: 'DevOps & Cloud', required: false })
  category?: string;

  @ApiProperty({
    example: 'critical',
    enum: ['critical', 'high', 'medium', 'low'],
  })
  priority: 'critical' | 'high' | 'medium' | 'low';

  @ApiProperty({ example: 'Missing', enum: ['Missing', 'Partial'] })
  status: 'Missing' | 'Partial';

  @ApiProperty({ example: 0.42 })
  weight: number;

  @ApiProperty({ example: 0 })
  user_rate: number;

  @ApiProperty({ example: '2-3 months' })
  estimated_time: string;

  @ApiProperty({ example: '+28% job matches' })
  impact: string;

  @ApiProperty({ example: 'Trọng số 42%' })
  jobs_requiring: string;

  @ApiProperty({ example: false })
  started: boolean;

  @ApiProperty({ type: [SkillGapLearningCourseDto] })
  courses: SkillGapLearningCourseDto[];

  @ApiProperty({ type: [SkillGapLearningPathDetailDto] })
  paths: SkillGapLearningPathDetailDto[];

  @ApiProperty({
    example: ['Hoàn thành khóa học nền tảng', 'Thực hành dự án nhỏ'],
  })
  steps: string[];
}

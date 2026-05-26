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

export class CategoryGapDto {
  @ApiProperty({ example: 'Backend Development' })
  category: string;

  @ApiProperty({
    example: 4.3,
    description: 'Điểm gap chênh lệch trung bình/tổng của category',
  })
  gap_score: number;
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

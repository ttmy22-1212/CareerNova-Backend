import { ApiProperty } from '@nestjs/swagger';

export class SkillGapScoreCardDto {
  @ApiProperty({
    example: 69,
    description: 'Phần trăm độ khớp CV tổng quan (Card 1)',
  })
  match_score: number;
}

export class SkillGapMissingPercentCardDto {
  @ApiProperty({
    example: 40,
    description:
      'Phần trăm kĩ năng còn thiếu trên tổng số kĩ năng ngành (Card 2)',
  })
  missing_percentage: number;
}

export class SkillGapRadarPointDto {
  @ApiProperty({ example: 'TypeScript', description: 'Tên kỹ năng' })
  skill_name: string;

  @ApiProperty({ example: 92, description: 'Tỷ lệ thành thạo của User (%)' })
  user_score: number;

  @ApiProperty({ example: 100, description: 'Mức độ thị trường yêu cầu (%)' })
  market_score: number;
}

export class SkillGapDetailLineDto {
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

export class SkillGapCategoryBreakdownDto {
  @ApiProperty({ example: 'DevOps', description: 'Tên danh mục kĩ năng' })
  category: string;

  @ApiProperty({
    example: 'Cốt lõi',
    description: 'Nhãn ưu tiên cao nhất của danh mục',
  })
  label: string;

  @ApiProperty({
    type: [SkillGapDetailLineDto],
    description: 'Danh sách chi tiết kĩ năng bên trong',
  })
  skills: SkillGapDetailLineDto[];
}

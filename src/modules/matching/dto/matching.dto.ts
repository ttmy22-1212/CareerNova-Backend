import { ApiProperty } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
} from 'class-validator';

export class AnalyzeCvDto {
  @ApiProperty({
    example: 'uuid-string-of-cv',
    description: 'ID của CV trong hệ thống',
  })
  @IsUUID()
  @IsNotEmpty()
  cv_id: string;

  @ApiProperty({
    example: 'Senior React Developer',
    description: 'Tên nhóm công việc mục tiêu (Dùng cho đối sánh theo Group)',
    required: false,
  })
  @IsString()
  @IsOptional()
  search_group?: string;

  @ApiProperty({
    example: 'https://itviec.com/it-jobs/...',
    description:
      'Đường dẫn chi tiết bài đăng tuyển dụng (Dùng cho đối sánh theo URL)',
    required: false,
  })
  @IsUrl()
  @IsOptional()
  job_url?: string;
}

export class CheckHistoryResponseDto {
  @ApiProperty({ example: true })
  has_history: boolean;

  @ApiProperty({ example: 'uuid-of-latest-match', nullable: true })
  latest_match_id: string | null;
}

export class CvJobMatchResultDto {
  @ApiProperty({ example: 'uuid-string-of-match' })
  match_id: string;

  @ApiProperty({ example: 'uuid-string-of-cv' })
  cv_id: string;

  @ApiProperty({ example: 'job_group' })
  match_type: string;

  @ApiProperty({ example: 'Senior React Developer' })
  search_group: string | null;

  @ApiProperty({ example: 0.57 })
  match_score: number | null;

  @ApiProperty({ description: 'Dữ liệu kỹ năng khớp cho biểu đồ radar' })
  radar_data: any; // Hoặc để Record<string, any> tùy cấu trúc tsconfig

  @ApiProperty({ description: 'Báo cáo thiếu hụt kỹ năng' })
  gap_report: any;

  @ApiProperty({ example: '2026-05-23T00:00:00.000Z' })
  created_at: Date;

  @ApiProperty({ example: '2026-05-23T00:00:00.000Z' })
  updated_at: Date;
}

export class GetRadarCategoryQueryDto {
  @ApiProperty({
    example: 'Hard Skills',
    description: 'Tên category muốn lọc để hiển thị radar',
  })
  @IsString()
  @IsNotEmpty()
  category: string;
}

export class MatchCategoryResponseDto {
  @ApiProperty({ example: 'Ngôn ngữ lập trình' })
  category: string;

  @ApiProperty({
    example: true,
    description: 'Có kỹ năng nào thuộc nhóm này trong lượt match không',
  })
  is_matched: boolean;
}

export class MatchedSkillDetailDto {
  @ApiProperty({ example: 42, description: 'ID của kỹ năng' })
  skill_id: number;

  @ApiProperty({ example: 'React', description: 'Tên kỹ năng' })
  skill_name: string;

  @ApiProperty({
    example: 0.15,
    description: 'Trọng số/Độ quan trọng của skill đối với Job',
  })
  weight: number;

  @ApiProperty({
    example: 0.85,
    description: 'Mức độ tương thích của CV ứng viên với skill này',
  })
  similarity: number;

  @ApiProperty({
    example: 0.1275,
    description: 'Điểm đóng góp vào tổng điểm match score',
  })
  contribution: number;
}

export class RadarCategoryResponseDto {
  @ApiProperty({
    type: [MatchedSkillDetailDto],
    description: 'Danh sách kỹ năng đã được lọc theo category',
  })
  data: MatchedSkillDetailDto[];
}

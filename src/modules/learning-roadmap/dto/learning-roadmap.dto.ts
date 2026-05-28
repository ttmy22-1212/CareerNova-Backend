import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class LearningRoadmapFilterDto {
  @ApiPropertyOptional({ description: 'Từ khóa skill_key để lọc lộ trình' })
  skill?: string;

  @ApiPropertyOptional({
    description:
      'Cấp độ khóa học gợi ý (All, Beginner, Intermediate, Advanced)',
    default: 'All',
  })
  level?: string;

  @ApiPropertyOptional({
    description: 'Số lượng lộ trình/khóa học tối đa muốn lấy',
    default: 6,
  })
  limit?: string;
}

export class SavedCourseActionDto {
  @ApiProperty({ description: 'ID của khóa học muốn lưu hoặc hủy lưu' })
  @IsNotEmpty()
  @IsString()
  course_id: string;
}

export class CourseItemDto {
  @ApiProperty() id: string;
  @ApiProperty() title: string;
  @ApiProperty() provider: string;
  @ApiProperty() duration: string;
  @ApiProperty() level: string;
  @ApiProperty() rating: number;
  @ApiProperty() learners: number;
  @ApiProperty() progress: number;
  @ApiProperty() is_saved: boolean;
  @ApiProperty() skills: string[];
  @ApiProperty() price: number;
  @ApiProperty() image: string;
  @ApiPropertyOptional() source_url?: string;
}

export class LearningPathDto {
  @ApiProperty() id: string;
  @ApiProperty() title: string;
  @ApiProperty() description: string;
  @ApiProperty() duration: string;
  @ApiProperty() progress: number;
  @ApiProperty() difficulty: string;
  @ApiProperty() icon: string;
  @ApiProperty() color: string;
  @ApiProperty() skill_key: string;
  @ApiProperty({ type: [CourseItemDto] }) courses: CourseItemDto[];
}

export class LearningRoadmapResponseDto {
  @ApiProperty({ type: [LearningPathDto] })
  learning_paths: LearningPathDto[];

  @ApiProperty({ type: [CourseItemDto] })
  recommended_courses: CourseItemDto[];
}

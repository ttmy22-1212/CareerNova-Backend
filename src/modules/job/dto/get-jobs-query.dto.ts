import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  IsNumber,
  IsEnum,
  Min,
  IsUUID,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';

export enum SortOrder {
  ASC = 'asc',
  DESC = 'desc',
}

export class GetJobsQueryDto {
  @ApiPropertyOptional({ example: 1, description: 'Trang hiện tại' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ example: 20, description: 'Số lượng item mỗi trang' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  limit?: number = 20;

  @ApiPropertyOptional({
    description: 'Tìm kiếm theo title, skills hoặc công ty',
  })
  @IsOptional()
  @IsString()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  q?: string;

  @ApiPropertyOptional({
    example: 'Full-time',
    description: 'Hình thức làm việc',
  })
  @IsOptional()
  @IsString()
  work_type?: string;

  @ApiPropertyOptional({ example: 'HCM', description: 'Địa điểm làm việc' })
  @IsOptional()
  @IsString()
  location?: string;

  @ApiPropertyOptional({ example: 'Senior', description: 'Mức kinh nghiệm' })
  @IsOptional()
  @IsString()
  experience_level?: string;

  @ApiPropertyOptional({ description: 'ID của CV để tính match_score' })
  @IsOptional()
  @IsUUID()
  cv_id?: string;

  @ApiPropertyOptional({
    example: 70,
    description: 'Lọc job có match_score tối thiểu',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  min_match?: number;

  @ApiPropertyOptional({
    example: 'listed_time',
    description: 'Trường cần sort (listed_time, salary_med, match_score)',
  })
  @IsOptional()
  @IsString()
  sortBy?: string = 'listed_time';

  @ApiPropertyOptional({ enum: SortOrder, default: SortOrder.DESC })
  @IsOptional()
  @IsEnum(SortOrder)
  sortOrder?: SortOrder = SortOrder.DESC;
}

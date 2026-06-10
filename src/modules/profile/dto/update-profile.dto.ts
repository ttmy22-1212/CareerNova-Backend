import {
  IsOptional,
  IsString,
  IsBoolean,
  IsInt,
  IsNumber,
  Min,
  Max,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateProfileDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  full_name?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  avatar_url?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  major?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  school?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  current_year?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  orientation?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  objective?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  target_salary?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  prefer_remote?: boolean;

  @ApiProperty({
    required: false,
    description: 'Cho phép tự động đối sánh CV mặc định để gợi ý việc làm',
  })
  @IsOptional()
  @IsBoolean()
  allow_default_cv_matching?: boolean;
}

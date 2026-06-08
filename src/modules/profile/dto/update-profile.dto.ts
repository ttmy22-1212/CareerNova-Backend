import { IsOptional, IsString, IsBoolean } from 'class-validator';
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

  @ApiProperty({ required: false, description: 'Cho phép tự động đối sánh CV mặc định để gợi ý việc làm' })
  @IsOptional()
  @IsBoolean()
  allow_default_cv_matching?: boolean;
}

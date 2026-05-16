import {
  IsString,
  IsInt,
  IsOptional,
  Min,
  Max,
  IsNumber,
  IsBoolean,
} from 'class-validator';

export class UpdateOnboardingProgressDto {
  @IsInt()
  @Min(1)
  @Max(5)
  current_step: number;

  @IsString()
  @IsOptional()
  major?: string;

  @IsString()
  @IsOptional()
  school?: string;

  @IsInt()
  @Min(1)
  @Max(5)
  @IsOptional()
  current_year?: number;

  @IsString()
  @IsOptional()
  orientation?: string;

  @IsString()
  @IsOptional()
  objective?: string;

  @IsOptional()
  @IsNumber()
  target_salary?: number;

  @IsOptional()
  @IsBoolean()
  prefer_remote?: boolean;
}

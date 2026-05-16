import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class GetSkillsQueryDto {
  @ApiPropertyOptional({
    description: 'Từ khóa tìm kiếm tên kỹ năng (vd: react, docker)',
  })
  @IsOptional()
  @IsString()
  q?: string;
}

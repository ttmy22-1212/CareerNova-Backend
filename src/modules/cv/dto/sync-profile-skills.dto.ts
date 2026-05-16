import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsOptional, IsString, IsUUID } from 'class-validator';

export class SyncProfileSkillsDto {
  @ApiPropertyOptional({
    example: '11cfdbf2-570b-4feb-858c-478bcc664d21',
    description:
      'UUID của CV thật nếu user có upload file ở bước trước, nếu không truyền null',
  })
  @IsOptional()
  @IsUUID()
  cv_id?: string | null;

  @ApiProperty({
    example: ['React', 'Node.js', 'Docker'],
    description: 'Danh sách mảng chuỗi tên kĩ năng được chốt hạ sau cùng',
  })
  @IsArray()
  @IsString({ each: true })
  skills: string[];
}

export class SyncProfileSkillsResponseDto {
  @ApiProperty({ example: 'SKILLS_SYNCED_SUCCESSFULLY' })
  message: string;

  @ApiProperty({ example: '11cfdbf2-570b-4feb-858c-478bcc664d21' })
  cv_id: string;

  @ApiProperty({ example: 3 })
  synced_count: number;
}

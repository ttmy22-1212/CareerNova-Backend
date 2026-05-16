import { ApiProperty } from '@nestjs/swagger';

export class SkillItemDto {
  @ApiProperty({ example: 1 })
  skill_id: number;

  @ApiProperty({ example: 'React' })
  skill_name: string;
}

export class GetSkillsResponseDto {
  @ApiProperty({ type: [SkillItemDto] })
  data: SkillItemDto[];
}

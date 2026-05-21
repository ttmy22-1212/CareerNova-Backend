export class InDemandSkillItemDto {
  skill_id: number;
  skill_name: string;
  job_count: number;
}

export class InDemandSkillsResponseDto {
  skills: InDemandSkillItemDto[];
}

export class RisingSkillItemDto {
  skill_id: number;
  skill_name: string;
  job_count_current: number;
  avg_salary: number;
  growth_percentage: number;
}

export class RisingSkillsResponseDto {
  skills: RisingSkillItemDto[];
}

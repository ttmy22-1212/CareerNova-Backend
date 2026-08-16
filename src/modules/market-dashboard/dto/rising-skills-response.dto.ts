export class RisingSkillItemDto {
  skill_id: number;
  skill_name: string;
  job_count_current: number;
  avg_salary: number;
  // null với kỹ năng mới nổi (chưa đủ mẫu kỳ trước để tính % tăng trưởng)
  growth_percentage: number | null;
  // Tag: kỹ năng mới xuất hiện / chưa đủ dữ liệu kỳ trước — hiển thị nhãn "Mới"
  // thay cho % tăng trưởng ảo
  is_new: boolean;
}

export class RisingSkillsResponseDto {
  skills: RisingSkillItemDto[];
}

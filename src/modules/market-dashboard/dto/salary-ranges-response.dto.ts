export class SalaryRangeItemDto {
  /** Skill category label, kept as role for FE compatibility. */
  role: string;
  min_salary: number;
  max_salary: number;
  currency: string;
}

export class SalaryRangesResponseDto {
  ranges: SalaryRangeItemDto[];
}

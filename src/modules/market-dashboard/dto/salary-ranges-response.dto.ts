export class SalaryRangeItemDto {
  role: string;
  min_salary: number;
  max_salary: number;
  currency: string;
}

export class SalaryRangesResponseDto {
  ranges: SalaryRangeItemDto[];
}

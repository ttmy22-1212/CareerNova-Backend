export class IndustryItemDto {
  industry_name: string;
  count: number;
  percentage: number;
}

export class IndustryBreakdownResponseDto {
  industries: IndustryItemDto[];
}

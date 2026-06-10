export class IndustryItemDto {
  category_name: string;
  industry_name?: string;
  count: number;
  percentage: number;
}

export class IndustryBreakdownResponseDto {
  industries: IndustryItemDto[];
}

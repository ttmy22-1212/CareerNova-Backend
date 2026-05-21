export class HotJobItemDto {
  job_category: string;
  job_count: number;
  avg_salary: number;
}

export class HotJobsResponseDto {
  jobs: HotJobItemDto[];
}

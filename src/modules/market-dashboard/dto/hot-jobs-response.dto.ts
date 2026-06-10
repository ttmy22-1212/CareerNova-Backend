export class HotJobItemDto {
  job_id: string;
  title: string;
  company_name: string | null;
  location: string | null;
  work_type: string | null;
  job_category: string;
  save_count: number;
  job_count: number;
  avg_salary: number;
}

export class HotJobsResponseDto {
  jobs: HotJobItemDto[];
}

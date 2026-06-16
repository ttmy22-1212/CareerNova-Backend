export class HotJobItemDto {
  job_id: string;
  title: string;
  company_name: string | null;
  location: string | null;
  work_type: string | null;
  job_category: string;
  job_count: number;
  company_count: number;
  total_applies: number;
  total_views: number;
  remote_count: number;
}

export class HotJobsResponseDto {
  jobs: HotJobItemDto[];
}

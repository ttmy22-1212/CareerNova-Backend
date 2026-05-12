export class MarketSummaryDto {
  total_jobs: number;
  total_companies: number;
  avg_salary: number;
  top_skills: Array<{
    skill_id: number;
    skill_name: string;
    job_count: number;
    demand_percentage: number;
  }>;
  top_industries: Array<{
    industry_id: number;
    industry_name: string;
    job_count: number;
  }>;
  personal_market_insight?: {
    high_match_count: number;
    missing_skills_count: number;
    top_missing_skill: string;
    profile_strength: number;
  };
}

export class PersonalDashboardDto {
  avg_match_score: number;
  matched_jobs_count: number;
  critical_skill_gaps: string[];
  top_recommended_jobs: any[];
  profile_strength: number;
  profile_checklist: Array<{ id: string; done: boolean; weight: number }>;
  journey_stages: any[];
}

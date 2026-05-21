export class StatsCardResponseDto {
  // CARD 1: Active Job Postings
  active_jobs: {
    count: number; // Tổng số job thỏa filter và còn hạn
    growth_percentage: number; // Tỷ lệ tăng trưởng so với kỳ liền kề trước đó (+12.4%)
  };

  // CARD 2: Avg. IT Salary
  avg_it_salary: {
    average: number; // Trung bình cộng med_salary (đã chuẩn hóa USD/Năm)
    min: number; // Thấp nhất của min_salary (đã chuẩn hóa)
    max: number; // Cao nhất của max_salary (đã chuẩn hóa)
  };

  // CARD 3: Companies Hiring
  companies_hiring: {
    count: number; // Tổng số company_id duy nhất đang tuyển dụng thực tế
  };

  // CARD 4: Market Growth
  market_growth: {
    yoy_percentage: number; // Tăng trưởng YoY so với cùng kỳ năm ngoái
  };
}

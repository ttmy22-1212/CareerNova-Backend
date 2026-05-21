export class TrendDataPointDto {
  label: string; // Nhãn trục X (Ví dụ: mốc giờ "08:00", ngày "21/05", hoặc tuần "Tuần 1")
  total_postings: number; // Đường màu xanh dương - Tổng số job đăng trong mốc thời gian này
  remote_jobs: number; // Đường màu xanh lá - Số lượng job làm từ xa (is_remote=true hoặc work_type='Remote') [cite: 95, 96]
}

export class JobPostingTrendsResponseDto {
  x_axis_scale: 'hour' | 'day' | 'week' | 'month'; // Độ chia trục X được Backend quyết định
  data: TrendDataPointDto[];
}

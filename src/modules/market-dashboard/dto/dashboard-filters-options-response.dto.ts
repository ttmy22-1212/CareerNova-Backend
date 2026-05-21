export class FilterOptionDto {
  label: string; // Nhãn hiển thị trên UI (Ví dụ: "Last 7 days" hoặc "San Francisco")
  value: string; // Giá trị thực tế gửi lên API khi filter (Ví dụ: "7days" hoặc "San Francisco")
}

export class DashboardFiltersOptionsResponseDto {
  // Dropdown 1: Địa điểm (Lấy động từ DB)
  locations: FilterOptionDto[];

  // Dropdown 2: Khoảng thời gian (Cấu hình cố định - Hardcoded)
  time_ranges: FilterOptionDto[];

  // Dropdown 3: Chế độ làm việc (Lấy động từ DB)
  work_types: FilterOptionDto[];
}

import { IsOptional, IsString, IsIn } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class DashboardFilterDto {
  @ApiPropertyOptional({
    description: 'Địa điểm làm việc (Lấy động từ API /filters)',
    example: 'San Francisco',
  })
  @IsOptional()
  @IsString()
  location?: string;

  @ApiPropertyOptional({
    description: 'Khoảng thời gian lọc dữ liệu ngắn hạn',
    enum: ['7days', '14days', '30days'],
    default: '30days',
    example: '30days',
  })
  @IsOptional()
  @IsString()
  @IsIn(['7days', '14days', '30days'], {
    message: 'time_range phải là một trong các giá trị: 7days, 14days, 30days',
  })
  time_range: string = '30days';

  @ApiPropertyOptional({
    description: 'Hình thức/Chế độ làm việc công việc',
    enum: ['Full-time', 'Remote', 'Hybrid', 'Part-time', 'Contract'],
    example: 'Remote',
  })
  @IsOptional()
  @IsString()
  @IsIn(['Full-time', 'Remote', 'Hybrid', 'Part-time', 'Contract'], {
    message:
      'work_type phải là một trong các hình thức: Full-time, Remote, Hybrid, Part-time, Contract',
  })
  work_type?: string;
}

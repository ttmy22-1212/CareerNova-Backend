import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  RecommendedJobDto,
  SavedReportItemDto,
} from './dto/recommendation.dto';

@Injectable()
export class RecommendationService {
  private readonly logger = new Logger(RecommendationService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 1. LẤY VIỆC LÀM GỢI Ý (Giới hạn bài đăng tuyển dụng đăng trong vòng 1 tháng qua)
   */
  async getRecentRecommendedJobs(userId: string): Promise<RecommendedJobDto[]> {
    try {
      this.logger.log(
        `Fetching 1-month window recommended jobs for user: ${userId}`,
      );

      const user = await this.prisma.user.findUnique({
        where: { user_id: userId },
        select: { default_match_id: true, default_cv_id: true },
      });

      if (!user || !user.default_match_id || !user.default_cv_id) return [];

      const defaultMatch = await this.prisma.cvJobMatch.findUnique({
        where: { match_id: user.default_match_id },
        select: { search_group: true },
      });

      if (!defaultMatch || !defaultMatch.search_group) return [];

      // Mốc thời gian chốt chặn: Đúng 1 tháng trước (30 ngày trước so với thời điểm hiện tại)
      const oneMonthAgo = new Date();
      oneMonthAgo.setDate(oneMonthAgo.getDate() - 30);

      // Luồng 1: Tìm từ lịch sử so khớp CV cụ thể có ngày cào (scraped_at) trong vòng 1 tháng
      const matchedJobs = await this.prisma.cvJobMatch.findMany({
        where: {
          cv_id: user.default_cv_id,
          search_group: defaultMatch.search_group,
          job_id: { not: null },
          job: {
            scraped_at: { gte: oneMonthAgo }, // Chốt chặn hiệu năng 1 tháng
          },
        },
        include: {
          job: {
            include: { company: true, salaries: true },
          },
        },
        orderBy: { match_score: 'desc' },
        take: 5,
      });

      const validMatches = matchedJobs.filter((m) => m.job !== null);

      if (validMatches.length > 0) {
        return validMatches.map((m) => {
          const job = m.job!;
          const salary = job.salaries[0];
          let salaryText = 'Thỏa thuận';
          if (salary && (salary.min_salary || salary.max_salary)) {
            salaryText = `${Math.round(Number(salary.min_salary || 0))} - ${Math.round(Number(salary.max_salary || 0))} ${salary.currency || 'VND'}`;
          }

          return {
            job_id: job.job_id.toString(),
            title: job.title,
            company_name: job.company?.name || 'N/A',
            location: job.location || 'N/A',
            match_rate: `${Math.round(Number(m.match_score || 0))}% match`,
            salary_text: salaryText,
          };
        });
      }

      // Luồng 2: Fallback nếu chưa từng chạy match job cụ thể -> Quét thẳng bảng job theo group đăng trong 1 tháng
      this.logger.log(
        `Fallback to query raw jobs within 1 month from group: ${defaultMatch.search_group}`,
      );

      const rawJobs = await this.prisma.job.findMany({
        where: {
          job_category: defaultMatch.search_group,
          scraped_at: { gte: oneMonthAgo }, // Chốt chặn hiệu năng 1 tháng
        },
        include: {
          company: true,
          salaries: true,
        },
        orderBy: {
          scraped_at: 'desc',
        },
        take: 5,
      });

      return rawJobs.map((job) => {
        const salary = job.salaries[0];
        let salaryText = 'Thỏa thuận';
        if (salary && (salary.min_salary || salary.max_salary)) {
          salaryText = `${Math.round(Number(salary.min_salary || 0))} - ${Math.round(Number(salary.max_salary || 0))} ${salary.currency || 'VND'}`;
        }

        return {
          job_id: job.job_id.toString(),
          title: job.title,
          company_name: job.company?.name || 'N/A',
          location: job.location || 'N/A',
          match_rate: 'Xem chi tiết',
          salary_text: salaryText,
        };
      });
    } catch (error: unknown) {
      this.handleError(error, 'Get Recent Recommended Jobs');
      return [];
    }
  }

  /**
   * 2. LẤY DANH SÁCH BÁO CÁO ĐÃ LƯU (SAVED REPORTS)
   */
  async getSavedReportsList(userId: string): Promise<SavedReportItemDto[]> {
    try {
      this.logger.log(`Fetching saved reports list for user: ${userId}`);

      // Lấy tất cả lượt match thuộc về các CV của User này
      const matches = await this.prisma.cvJobMatch.findMany({
        where: {
          cv: {
            user_id: userId,
          },
        },
        include: {
          job: {
            select: { title: true },
          },
        },
        orderBy: {
          created_at: 'desc',
        },
      });

      return matches.map((m) => {
        const rawScore = Number(m.match_score || 0);
        const finalScore =
          rawScore <= 1 ? Math.round(rawScore * 100) : Math.round(rawScore);

        // Phân loại luồng hiển thị text nhãn theo quy chuẩn tài liệu chốt
        let reportName = '';
        if (m.match_type === 'cv_job' && m.job?.title) {
          reportName = `CV Match — ${m.job.title}`;
        } else {
          reportName = `Skill Gap Report — ${m.search_group || 'General Path'}`;
        }

        return {
          match_id: m.match_id,
          report_name: reportName,
          match_type: m.match_type,
          match_score: finalScore,
          created_at: m.created_at,
        };
      });
    } catch (error: unknown) {
      this.handleError(error, 'Get Saved Reports List');
      throw new BadRequestException('Could not fetch saved reports history');
    }
  }

  private handleError(error: unknown, context: string) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const stack = error instanceof Error ? error.stack : '';
    this.logger.error(
      `RecommendationService ${context} failed: ${message}`,
      stack,
    );
  }
}

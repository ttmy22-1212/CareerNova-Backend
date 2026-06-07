import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  DashboardBannerDto,
  DashboardStatisticsDto,
  RecommendedJobDto,
  CategoryGapDto,
  RecentActivityDto,
  DashboardProgressDto,
} from './dto/personal-dashboard.dto';

interface MatchedSkillDetail {
  skill_id: number;
  skill_name: string;
  weight: number;
  similarity: number;
  contribution: number;
}

interface PartialSkillDetail extends MatchedSkillDetail {
  gap: number;
  matched_via: string;
}

interface MissingSkillDetail {
  skill_id: number;
  skill_name: string;
  weight: number;
  similarity: number;
  gap: number;
}

interface GapReportStructure {
  partially_matched_skills: PartialSkillDetail[];
  missing_skills: MissingSkillDetail[];
}

@Injectable()
export class PersonalDashboardService {
  private readonly logger = new Logger(PersonalDashboardService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getBanner(userId: string): Promise<DashboardBannerDto> {
    try {
      this.logger.log(`Fetching dashboard banner for user: ${userId}`);

      const user = await this.prisma.user.findUnique({
        where: { user_id: userId },
        select: { default_match_id: true, default_cv_id: true },
      });

      if (!user || !user.default_match_id || !user.default_cv_id) {
        return { match_score: 0, suitable_jobs_count: 0 };
      }

      const defaultMatch = await this.prisma.cvJobMatch.findUnique({
        where: { match_id: user.default_match_id },
        select: { match_score: true, search_group: true, job_id: true },
      });

      if (!defaultMatch) {
        return { match_score: 0, suitable_jobs_count: 0 };
      }

      let highestJobScore = 0;

      // LUỒNG XỬ LÝ THEO LOẠI HÌNH MATCHING ĐỂ LẤY GIÁ TRỊ SUITABLE JOBS
      if (defaultMatch.job_id) {
        // Luồng 1: Nếu default matching là Job URL cụ thể -> suitable_jobs_count chính là điểm của Job đó
        highestJobScore = Math.round(Number(defaultMatch.match_score || 0));
      } else if (defaultMatch.search_group) {
        // Luồng 2: Nếu default matching là Search Group -> Tìm job có điểm cao nhất trong cùng group
        const maxMatchJob = await this.prisma.cvJobMatch.findFirst({
          where: {
            cv_id: user.default_cv_id,
            search_group: defaultMatch.search_group,
            job_id: { not: null },
          },
          orderBy: {
            match_score: 'desc',
          },
          select: {
            match_score: true,
          },
        });

        highestJobScore =
          maxMatchJob && maxMatchJob.match_score
            ? Math.round(Number(maxMatchJob.match_score))
            : 0;
      }

      return {
        match_score: Math.round(Number(defaultMatch.match_score || 0)),
        suitable_jobs_count: highestJobScore,
      };
    } catch (error: unknown) {
      this.handleError(error, 'Get Banner');
      throw new BadRequestException('Could not fetch dashboard banner data');
    }
  }

  async getStatistics(userId: string): Promise<DashboardStatisticsDto> {
    try {
      this.logger.log(`Fetching dashboard statistics for user: ${userId}`);

      // 1. Lấy thông tin user cùng danh sách CV
      const user = await this.prisma.user.findUnique({
        where: { user_id: userId },
        include: { cvs: { take: 1 } },
      });

      if (!user) {
        throw new BadRequestException('User not found');
      }

      let matchScore = 0;
      let missingSkillsCount = 0;

      // 2. Nếu đã có lượt so khớp mặc định
      if (user.default_match_id) {
        const defaultMatch = await this.prisma.cvJobMatch.findUnique({
          where: { match_id: user.default_match_id },
          select: {
            match_score: true,
            gap_report: true,
            search_group: true,
            job_id: true,
          },
        });

        if (defaultMatch) {
          // Gắn điểm số tổng quan của default match ban đầu
          matchScore = Math.round(Number(defaultMatch.match_score || 0));

          // Ép kiểu JsonValue về đúng Interface cấu trúc báo cáo của thuật toán
          const gapReport =
            defaultMatch.gap_report as unknown as GapReportStructure;

          // Bóc tách chính xác mảng missing_skills từ Object gap_report theo đúng log thực tế
          if (gapReport && Array.isArray(gapReport.missing_skills)) {
            missingSkillsCount = gapReport.missing_skills.length;
          }

          // ĐỒNG BỘ LOGIC ĐIỂM SỐ VỚI BANNER THEO 2 LUỒNG
          if (defaultMatch.job_id) {
            matchScore = Math.round(Number(defaultMatch.match_score || 0));
          } else if (user.default_cv_id && defaultMatch.search_group) {
            const maxMatchJob = await this.prisma.cvJobMatch.findFirst({
              where: {
                cv_id: user.default_cv_id,
                search_group: defaultMatch.search_group,
                job_id: { not: null },
              },
              orderBy: {
                match_score: 'desc',
              },
              select: {
                match_score: true,
              },
            });

            if (maxMatchJob && maxMatchJob.match_score) {
              matchScore = Math.round(Number(maxMatchJob.match_score));
            }
          }
        }
      }

      // 3. Tính toán % hoàn thiện hồ sơ từ file gốc ban đầu
      let filledFields = 0;
      const fieldsToTrack = [
        user.full_name,
        user.school,
        user.major,
        user.objective,
        user.orientation,
      ];

      fieldsToTrack.forEach((field) => {
        if (field && field.trim() !== '') filledFields++;
      });

      if (user.cvs.length > 0) {
        filledFields++;
      }

      const totalFields = fieldsToTrack.length + 1;
      const profileCompletionPercentage = Math.round(
        (filledFields / totalFields) * 100,
      );

      return {
        match_score: matchScore, // Trả ra điểm số cao nhất tương ứng với logic hiển thị trên Card
        missing_skills_count: missingSkillsCount, // Đếm chuẩn từ gap_report.missing_skills
        profile_completion_percentage: profileCompletionPercentage,
      };
    } catch (error: unknown) {
      this.handleError(error, 'Get Statistics');
      throw new BadRequestException('Could not fetch dashboard statistics');
    }
  }

  async getSkillsChartData(userId: string): Promise<CategoryGapDto[]> {
    try {
      this.logger.log(`Fetching skills chart data for user: ${userId}`);

      const user = await this.prisma.user.findUnique({
        where: { user_id: userId },
        select: { default_match_id: true },
      });

      if (!user || !user.default_match_id) {
        return [];
      }

      const defaultMatch = await this.prisma.cvJobMatch.findUnique({
        where: { match_id: user.default_match_id },
        select: { gap_report: true, search_group: true, job_id: true },
      });

      if (!defaultMatch || !defaultMatch.gap_report) {
        return [];
      }

      const gapReport =
        defaultMatch.gap_report as unknown as GapReportStructure;
      const missingSkills = gapReport.missing_skills || [];
      const partialSkills = gapReport.partially_matched_skills || [];

      // THÍCH ỨNG TRÍCH XUẤT KỸ NĂNG PHÂN LOẠI CHO BIỂU ĐỒ THEO DANH MỤC
      let baseSkills: Array<{
        skill_id: number;
        category: string;
        weight: number;
      }> = [];

      if (defaultMatch.job_id) {
        const jobSkills = await this.prisma.jobSkill.findMany({
          where: { job_id: defaultMatch.job_id },
          include: { skill: true },
        });
        baseSkills = jobSkills.map((js) => ({
          skill_id: js.skill_id,
          category: js.skill.category || 'General',
          weight: 1.0,
        }));
      } else if (defaultMatch.search_group) {
        const groupWeights = await this.prisma.jobGroupSkillWeight.findMany({
          where: { search_group: defaultMatch.search_group },
          include: { skill: true },
        });
        baseSkills = groupWeights.map((gw) => ({
          skill_id: gw.skill_id,
          category: gw.skill.category || 'General',
          weight: Number(gw.weight_wi),
        }));
      }

      const categoryMap = new Map<string, number>();

      for (const bs of baseSkills) {
        const category = bs.category;
        const currentScore = categoryMap.get(category) || 0;

        const isMissing = missingSkills.some((m) => m.skill_id === bs.skill_id);
        const isPartial = partialSkills.some((p) => p.skill_id === bs.skill_id);

        let gapImpact = 0;
        if (isMissing) {
          gapImpact = -bs.weight * 10;
        } else if (isPartial) {
          const partialItem = partialSkills.find(
            (p) => p.skill_id === bs.skill_id,
          );
          const gapVal = partialItem ? partialItem.gap : 0;
          gapImpact = -Number(gapVal) * 10;
        } else {
          gapImpact = bs.weight * 5;
        }

        categoryMap.set(category, currentScore + gapImpact);
      }

      // Chuyển map thành mảng VÀ FILTER BỎ những danh mục có gap_score === 0 (Giữ nguyên logic chốt chặn file gốc)
      return Array.from(categoryMap.entries())
        .map(([category, score]) => ({
          category,
          gap_score: Number(score.toFixed(1)),
        }))
        .filter((item) => item.gap_score !== 0); // CHỐT CHẶN: Chỉ giữ lại danh mục có biến động điểm
    } catch (error: unknown) {
      this.handleError(error, 'Get Skills Chart Data');
      return [];
    }
  }

  async getRecommendedJobs(userId: string): Promise<RecommendedJobDto[]> {
    try {
      this.logger.log(`Fetching recommended jobs for user: ${userId}`);

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

      // 1. Thử tìm từ lịch sử so khớp CV cụ thể với các job trong cùng search_group
      const oneMonthAgo = new Date();
      oneMonthAgo.setDate(oneMonthAgo.getDate() - 30);
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
        // Kéo nhiều hơn một chút để đề phòng sau khi lọc trùng vẫn đủ 5 bản ghi
        take: 20,
      });

      // LỌC TRÙNG: Chỉ giữ lại lượt so khớp có điểm cao nhất cho mỗi job_id độc nhất
      const uniqueMatchesMap = new Map<string, (typeof matchedJobs)[0]>();

      matchedJobs.forEach((m) => {
        if (m.job_id && !uniqueMatchesMap.has(m.job_id.toString())) {
          uniqueMatchesMap.set(m.job_id.toString(), m);
        }
      });

      // Chuyển map thành mảng phẳng và giới hạn lấy đúng top 5 job phù hợp nhất
      const validMatches = Array.from(uniqueMatchesMap.values())
        .filter((m) => m.job !== null)
        .slice(0, 5);

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

      // 2. FALLBACK LUỒNG SEARCH GROUP: Quét thẳng bảng job theo nhóm ngành nếu user chưa từng chạy match job cụ thể nào
      this.logger.log(
        `No matching history found. Falling back to query raw jobs from group: ${defaultMatch.search_group}`,
      );

      const rawJobs = await this.prisma.job.findMany({
        where: {
          job_category: defaultMatch.search_group,
        },
        include: {
          company: true,
          salaries: true,
        },
        orderBy: {
          scraped_at: 'desc', // FIX LỖI: Sửa từ created_at thành scraped_at theo đúng schema.prisma của bạn
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
      this.handleError(error, 'Get Recommended Jobs');
      return [];
    }
  }

  async getProgressData(userId: string): Promise<DashboardProgressDto> {
    try {
      this.logger.log(`Fetching progress tab data for user: ${userId}`);

      // 1. Lấy thông tin user cùng CV và lượt match mới nhất của họ
      const user = await this.prisma.user.findUnique({
        where: { user_id: userId },
        include: {
          cvs: {
            orderBy: { uploaded_at: 'desc' },
            take: 1,
          },
        },
      });

      if (!user) {
        throw new BadRequestException('User not found');
      }

      const latestMatch = await this.prisma.cvJobMatch.findFirst({
        where: { cv: { user_id: userId } },
        orderBy: { created_at: 'desc' },
        select: { created_at: true },
      });

      // 2. Dựng trạng thái từng bước cho Checklist bên trái
      const checklist = [
        {
          step_name: 'Chọn ngành học & trường',
          is_completed: !!(user.school && user.major),
        },
        {
          step_name: 'Chọn năm học & 1-3 định hướng quan tâm',
          is_completed: !!(user.current_year && user.orientation),
        },
        {
          step_name: 'Khai báo skill mạnh nhất',
          is_completed: !!user.objective, // Giả định dùng trường mục tiêu/kỹ năng để check
        },
        {
          step_name: 'Upload CV để phân tích chính xác hơn',
          is_completed: user.cvs.length > 0,
        },
        {
          step_name: 'Đặt mục tiêu nghề nghiệp',
          is_completed: !!user.target_salary,
        },
        {
          step_name: 'Hoàn thành Career Quiz',
          is_completed: user.onboarding_completed,
        },
      ];

      // Tính tổng % hoàn thiện hồ sơ dựa trên checklist
      const completedSteps = checklist.filter(
        (item) => item.is_completed,
      ).length;
      const profileCompletionPercentage = Math.round(
        (completedSteps / checklist.length) * 100,
      );

      // 3. Dựng cấu phần Hoạt động gần đây bên phải (Chỉ lấy 2 mốc thời gian chuẩn theo yêu cầu)
      const latestCv = user.cvs[0];
      const recentActivities: RecentActivityDto[] = [
        {
          activity_name: 'CV uploaded',
          recorded_at: latestCv ? latestCv.uploaded_at : null,
        },
        {
          activity_name: 'CV analyzed',
          recorded_at: latestMatch ? latestMatch.created_at : null,
        },
      ];

      return {
        profile_completion_percentage: profileCompletionPercentage,
        checklist,
        recent_activities: recentActivities,
      };
    } catch (error: unknown) {
      this.handleError(error, 'Get Progress Data');
      throw new BadRequestException('Could not fetch progress dashboard data');
    }
  }

  private handleError(error: unknown, context: string) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const stack = error instanceof Error ? error.stack : '';
    this.logger.error(`PersonalDashboard ${context} failed: ${message}`, stack);
  }
}

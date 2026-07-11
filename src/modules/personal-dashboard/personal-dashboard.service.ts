import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { MatchingService } from '../matching/matching.service';
import {
  DashboardBannerDto,
  DashboardStatisticsDto,
  RecommendedJobDto,
  CategoryGapDto,
  RecentActivityDto,
  DashboardProgressDto,
  JourneyProgressDto,
  JourneyStageDto,
} from './dto/personal-dashboard.dto';
import { formatSalaryText as formatSalaryTextValue } from '../../common/utils/salary.util';

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

  constructor(
    private readonly prisma: PrismaService,
    private readonly matchingService: MatchingService,
  ) {}

  async getBanner(userId: string): Promise<DashboardBannerDto> {
    try {
      this.logger.log(`Fetching dashboard banner for user: ${userId}`);

      const user = await this.prisma.user.findUnique({
        where: { user_id: userId },
        select: { default_match_id: true },
      });

      if (!user || !user.default_match_id) {
        return { match_score: 0, suitable_jobs_count: 0 };
      }

      const defaultMatch = await this.prisma.cvJobMatch.findUnique({
        where: { match_id: user.default_match_id },
        select: { match_score: true },
      });

      if (!defaultMatch) {
        return { match_score: 0, suitable_jobs_count: 0 };
      }

      // Đếm toàn bộ job phù hợp >= 70% trong lịch sử matching của user.
      // Hỗ trợ cả dữ liệu cũ thang 0-1 và dữ liệu mới thang 0-100.
      const suitableCount = await this.prisma.cvJobMatch.count({
        where: {
          cv: { user_id: userId },
          job_id: { not: null },
          OR: [
            { match_score: { gte: 70 } },
            {
              AND: [{ match_score: { gte: 0.7 } }, { match_score: { lte: 1 } }],
            },
          ],
        },
      });

      return {
        match_score: this.normalizeMatchScore(defaultMatch.match_score),
        suitable_jobs_count: suitableCount,
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
          matchScore = this.normalizeMatchScore(defaultMatch.match_score);

          // Ép kiểu JsonValue về đúng Interface cấu trúc báo cáo của thuật toán
          const gapReport =
            defaultMatch.gap_report as unknown as GapReportStructure;

          // Bóc tách chính xác mảng missing_skills từ Object gap_report theo đúng log thực tế
          if (gapReport && Array.isArray(gapReport.missing_skills)) {
            missingSkillsCount = gapReport.missing_skills.length;
          }

          // ĐỒNG BỘ LOGIC ĐIỂM SỐ VỚI BANNER THEO 2 LUỒNG
          if (defaultMatch.job_id) {
            matchScore = this.normalizeMatchScore(defaultMatch.match_score);
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
              matchScore = this.normalizeMatchScore(maxMatchJob.match_score);
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
        baseSkills = jobSkills
          .filter((js) => this.isTechnicalSkill(js.skill.type, js.skill.category))
          .map((js) => ({
            skill_id: js.skill_id,
            category: js.skill.category || 'General',
            weight: 1.0,
          }));
      } else if (defaultMatch.search_group) {
        const groupWeights = await this.prisma.jobGroupSkillWeight.findMany({
          where: { search_group: defaultMatch.search_group },
          include: { skill: true },
        });
        baseSkills = groupWeights
          .filter((gw) => this.isTechnicalSkill(gw.skill.type, gw.skill.category))
          .map((gw) => ({
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
        select: {
          default_cv_id: true,
          allow_default_cv_matching: true,
          default_match: {
            select: {
              search_group: true,
            },
          },
        },
      });

      if (!user?.default_cv_id) return [];

      const searchGroup =
        user.default_match?.search_group ||
        (
          await this.prisma.cvJobMatch.findFirst({
            where: {
              cv_id: user.default_cv_id,
              search_group: { not: null },
            },
            orderBy: { created_at: 'desc' },
            select: { search_group: true },
          })
        )?.search_group ||
        null;

      if (user.allow_default_cv_matching && searchGroup) {
        await this.refreshDefaultMatchingIfNeeded(
          userId,
          user.default_cv_id,
          searchGroup,
        );
      }

      const matchedJobs = await this.prisma.cvJobMatch.findMany({
        where: {
          cv_id: user.default_cv_id,
          job_id: { not: null },
          OR: [
            { match_score: { gte: 70 } },
            {
              AND: [{ match_score: { gte: 0.7 } }, { match_score: { lte: 1 } }],
            },
          ],
        },
        include: {
          job: { include: { company: true, salaries: true } },
        },
      });

      const uniqueMap = new Map<string, (typeof matchedJobs)[number]>();
      for (const match of matchedJobs) {
        if (!match.job_id || !match.job) continue;

        const key = match.job_id.toString();
        const current = uniqueMap.get(key);

        if (
          !current ||
          this.normalizeMatchScore(match.match_score) >
            this.normalizeMatchScore(current.match_score)
        ) {
          uniqueMap.set(key, match);
        }
      }

      return Array.from(uniqueMap.values())
        .sort(
          (a, b) =>
            this.getJobPostedTime(b.job, b.created_at) -
            this.getJobPostedTime(a.job, a.created_at),
        )
        .map((match) => {
          const job = match.job!;

          return {
            job_id: job.job_id.toString(),
            title: job.title,
            company_name: job.company?.name || 'N/A',
            location: job.location || 'N/A',
            match_rate: `${this.normalizeMatchScore(match.match_score)}% match`,
            salary_text: this.formatSalaryText(job.salaries),
          };
        });
    } catch (error: unknown) {
      this.handleError(error, 'Get Recommended Jobs');
      return [];
    }
  }

  private async refreshDefaultMatchingIfNeeded(
    userId: string,
    cvId: string,
    searchGroup: string,
  ): Promise<void> {
    try {
      // Chưa có bản ghi điểm TỪNG JOB (per-job) cho nhóm này → cần backfill,
      // chạy lại match (force) bất kể có job mới hay không. Sau khi đã có per-job
      // thì chỉ chạy lại khi có job mới (logic bên dưới).
      const perJobCount = await this.prisma.cvJobMatch.count({
        where: {
          cv_id: cvId,
          match_type: 'existing_job',
          search_group: searchGroup,
          job_id: { not: null },
        },
      });
      const needPerJobBackfill = perJobCount === 0;

      if (!needPerJobBackfill) {
        const { startYesterday, endToday } = this.getTodayAndYesterdayBounds();

        const latestRecentJob = await this.prisma.job.findFirst({
        where: {
          AND: [
            {
              // Khớp nhóm theo case-insensitive cho nhất quán với
              // recommendation.service (Job.search_group có thể lệch hoa/thường
              // so với nhãn nhóm của default match).
              OR: [
                {
                  search_group: {
                    equals: searchGroup,
                    mode: 'insensitive' as const,
                  },
                },
                {
                  job_category: {
                    equals: searchGroup,
                    mode: 'insensitive' as const,
                  },
                },
              ],
            },
            {
              // "Job mới trong ngày" = được ĐĂNG hoặc được SCRAPE trong cửa sổ
              // hôm qua→hôm nay. Trước đây nhánh scraped_at chỉ áp dụng khi
              // listed_time == null, nên job scrape hôm nay nhưng mang
              // listed_time cũ (trường hợp phổ biến nhất) bị bỏ sót → refresh
              // không bao giờ chạy → không có lịch sử match mới.
              OR: [
                { listed_time: { gte: startYesterday, lt: endToday } },
                { scraped_at: { gte: startYesterday, lt: endToday } },
              ],
            },
          ],
        },
        orderBy: [{ scraped_at: 'desc' }, { listed_time: 'desc' }],
        select: {
          listed_time: true,
          scraped_at: true,
        },
      });

      if (!latestRecentJob) return;

      const latestMatch = await this.prisma.cvJobMatch.findFirst({
        where: {
          cv_id: cvId,
          search_group: searchGroup,
        },
        orderBy: { created_at: 'desc' },
        select: {
          created_at: true,
        },
      });

      const latestJobTime = Math.max(
        this.getTime(latestRecentJob.listed_time),
        this.getTime(latestRecentJob.scraped_at),
      );
        const latestMatchTime = this.getTime(latestMatch?.created_at);

        if (latestMatchTime >= latestJobTime) return;
      }

      await this.matchingService.analyzeCv(
        {
          cv_id: cvId,
          search_group: searchGroup,
          force: true,
        },
        userId,
      );
    } catch (error: unknown) {
      this.handleError(error, 'Refresh Default Matching');
    }
  }

  private getTodayAndYesterdayBounds(): {
    startYesterday: Date;
    endToday: Date;
  } {
    const startToday = new Date();
    startToday.setHours(0, 0, 0, 0);

    const startYesterday = new Date(startToday);
    startYesterday.setDate(startToday.getDate() - 1);

    const endToday = new Date(startToday);
    endToday.setDate(startToday.getDate() + 1);

    return { startYesterday, endToday };
  }

  private normalizeMatchScore(score: unknown): number {
    const rawScore = Number(score || 0);
    const normalizedScore = rawScore <= 1 ? rawScore * 100 : rawScore;

    return Math.round(normalizedScore);
  }

  private getJobPostedTime(
    job: { listed_time?: Date | null; scraped_at?: Date | null } | null,
    fallbackDate?: Date | null,
  ): number {
    return this.getTime(job?.listed_time || job?.scraped_at || fallbackDate);
  }

  private getTime(value: Date | string | null | undefined): number {
    return value ? new Date(value).getTime() : 0;
  }

  private formatSalaryText(
    salaries: Array<{
      min_salary: unknown;
      max_salary: unknown;
      med_salary?: unknown;
      currency: string | null;
      pay_period?: string | null;
    }>,
  ): string {
    return formatSalaryTextValue(salaries);
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

  async getJourneyProgress(userId: string): Promise<JourneyProgressDto> {
    try {
      this.logger.log(`Fetching journey progress for user: ${userId}`);

      const user = await this.prisma.user.findUnique({
        where: { user_id: userId },
        include: {
          cvs: { orderBy: { uploaded_at: 'desc' }, take: 1 },
          saved_jobs: { select: { saved_job_id: true } },
          saved_courses: { select: { course_id: true } },
        },
      });

      if (!user) {
        throw new BadRequestException('User not found');
      }

      const hasExplored =
        !!user.major && !!user.current_year && !!user.orientation;

      const hasCV = user.cvs.length > 0;
      let hasMatch = false;
      if (hasCV) {
        const matchCount = await this.prisma.cvJobMatch.count({
          where: { cv: { user_id: userId } },
        });
        hasMatch = matchCount > 0;
      }

      const hasLearningResource = user.saved_courses.length > 0;
      const hasSavedOpportunity = user.saved_jobs.length > 0;

      const stages: JourneyStageDto[] = [
        {
          id: 'explore',
          label: 'Khám phá hồ sơ',
          desc: 'Ngành học, năm học và định hướng',
          done: hasExplored || user.onboarding_completed,
          href: '/onboarding/welcome',
        },
        {
          id: 'analyze',
          label: 'Phân tích',
          desc: 'CV, kỹ năng và khoảng cách cần bổ sung',
          done: hasCV || hasMatch,
          href: '/skill-gap',
        },
        {
          id: 'resources',
          label: 'Tài nguyên học',
          desc: 'Lưu khóa học hoặc lộ trình tham khảo',
          done: hasLearningResource,
          href: '/roadmap',
        },
        {
          id: 'saved',
          label: 'Cơ hội đã lưu',
          desc: 'Lưu URL việc làm để xem lại',
          done: hasSavedOpportunity,
          href: '/jobs',
        },
      ];

      return { stages };
    } catch (error: unknown) {
      this.handleError(error, 'Get Journey Progress');
      throw new BadRequestException('Could not fetch journey progress');
    }
  }

  private handleError(error: unknown, context: string) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const stack = error instanceof Error ? error.stack : '';
    this.logger.error(`PersonalDashboard ${context} failed: ${message}`, stack);
  }

  // ==========================================
  //      SOFT SKILL FILTER (DÙNG CHUNG)
  // ==========================================

  /**
   * Danh sách category được phân loại là soft skill / phi chuyên môn.
   * Đồng bộ với MarketDashboardService.SOFT_SKILL_CATEGORIES.
   */
  private static readonly SOFT_SKILL_CATEGORIES = new Set([
    'Personal Attributes',
    'Social Skills',
    'Communication',
    'Initiative and Leadership',
    'Critical Thinking and Problem Solving',
    'Physical Abilities',
    'Material Handling',
    'Administrative Support and Clerical Tasks',
    'Writing and Editing',
    'Office and Productivity Equipment and Technology',
  ]);

  /** Chỉ nhận đúng kỹ năng có type `Specialized Skill`. */
  private isTechnicalSkill(
    type: string | null | undefined,
    _category: string | null | undefined,
  ): boolean {
    return type?.trim().toLowerCase() === 'specialized skill';
  }
}

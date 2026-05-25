import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  DashboardBannerDto,
  DashboardStatisticsDto,
  RecommendedJobDto,
  RadarSkillPointDto,
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
        select: { match_score: true, search_group: true },
      });
      console.log(defaultMatch);
      if (!defaultMatch || !defaultMatch.search_group) {
        return { match_score: 0, suitable_jobs_count: 0 };
      }

      const maxMatchJob = await this.prisma.cvJobMatch.findFirst({
        where: {
          cv_id: user.default_cv_id,
          search_group: defaultMatch.search_group,
          //   job_id: { not: null },
        },
        orderBy: {
          match_score: 'desc',
        },
        select: {
          match_score: true,
        },
      });

      const highestJobScore =
        maxMatchJob && maxMatchJob.match_score
          ? Math.round(Number(maxMatchJob.match_score))
          : 0;

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
          select: { match_score: true, gap_report: true, search_group: true },
        });

        if (defaultMatch) {
          // Gắn điểm số tổng quan của default match
          matchScore = Math.round(Number(defaultMatch.match_score || 0));

          // Ép kiểu JsonValue về đúng Interface cấu trúc báo cáo của thuật toán
          const gapReport =
            defaultMatch.gap_report as unknown as GapReportStructure;

          // Bóc tách chính xác mảng missing_skills từ Object gap_report theo đúng log thực tế
          if (gapReport && Array.isArray(gapReport.missing_skills)) {
            missingSkillsCount = gapReport.missing_skills.length;
          }

          // Tìm job khớp cao nhất (Max) trong search_group để ghi đè điểm hiển thị lên Card
          if (user.default_cv_id && defaultMatch.search_group) {
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

      // 3. Tính toán % hoàn thiện hồ sơ
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
        match_score: matchScore, // Trả ra điểm số cao nhất của job tương ứng với UI hiển thị trên Card 2
        missing_skills_count: missingSkillsCount, // Đếm chuẩn từ gap_report.missing_skills
        profile_completion_percentage: profileCompletionPercentage,
      };
    } catch (error: unknown) {
      this.handleError(error, 'Get Statistics');
      throw new BadRequestException('Could not fetch dashboard statistics');
    }
  }

  async getSkillsRadarData(userId: string): Promise<RadarSkillPointDto[]> {
    try {
      this.logger.log(
        `Fetching full skills radar chart data for user: ${userId}`,
      );

      // 1. Tìm lượt match mặc định của người dùng
      const user = await this.prisma.user.findUnique({
        where: { user_id: userId },
        select: { default_match_id: true },
      });

      if (!user || !user.default_match_id) {
        return [];
      }

      // 2. Lấy dữ liệu radar_data và gap_report của lượt match default
      const defaultMatch = await this.prisma.cvJobMatch.findUnique({
        where: { match_id: user.default_match_id },
        select: { radar_data: true, gap_report: true, search_group: true },
      });

      if (!defaultMatch || !defaultMatch.search_group) {
        return [];
      }

      // 3. Lấy TOP 6 kỹ năng chuẩn quy định cho search_group này trong DB để làm bộ khung định hình Radar
      const groupWeights = await this.prisma.jobGroupSkillWeight.findMany({
        where: { search_group: defaultMatch.search_group },
        include: { skill: true },
        take: 6, // Đảm bảo lấy tối đa 6 kĩ năng cố định của ngành
      });

      if (groupWeights.length === 0) {
        return [];
      }

      // Ép kiểu các trường JSON từ DB về đúng Interface cấu trúc thuật toán để xử lý sạch bóng 'any'
      const matchedSkillsList =
        (defaultMatch.radar_data as unknown as MatchedSkillDetail[]) || [];
      const gapReport =
        defaultMatch.gap_report as unknown as GapReportStructure;
      const partialSkills =
        (gapReport && gapReport.partially_matched_skills) || [];

      // 4. Duyệt qua 6 kĩ năng chuẩn của ngành, map điểm tương ứng của User vào
      return groupWeights.map((w) => {
        const skillId = w.skill_id;
        const skillName = w.skill.skill_name;
        const marketScore = Math.round(Number(w.weight_wi) * 100); // Trọng số thị trường (%)

        let userScore = 0;

        // Trường hợp 1: Kỹ năng nằm trong mảng đã khớp tốt (matched_skills / radar_data)
        const matchedItem = matchedSkillsList.find(
          (s) => s.skill_id === skillId,
        );

        // Trường hợp 2: Kỹ năng nằm trong mảng khớp một phần (partially_matched_skills)
        const partialItem = partialSkills.find((p) => p.skill_id === skillId);

        if (matchedItem) {
          userScore = Math.round((matchedItem.similarity || 0) * 100);
        } else if (partialItem) {
          userScore = Math.round((partialItem.similarity || 0) * 100);
        } else {
          // Trường hợp 3: Nằm trong missing_skills hoặc không có trong CV -> userScore giữ nguyên = 0
          userScore = 0;
        }

        return {
          skill_name: skillName,
          user_score: userScore,
          market_score: marketScore > 0 ? marketScore : 70, // Fallback nếu trọng số hiển thị quá nhỏ
        };
      });
    } catch (error: unknown) {
      this.handleError(error, 'Get Skills Radar Data');
      return [];
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
        select: { gap_report: true, search_group: true },
      });

      if (
        !defaultMatch ||
        !defaultMatch.gap_report ||
        !defaultMatch.search_group
      ) {
        return [];
      }

      const gapReport =
        defaultMatch.gap_report as unknown as GapReportStructure;
      const missingSkills = gapReport.missing_skills || [];
      const partialSkills = gapReport.partially_matched_skills || [];

      // 1. Lấy đúng cấu hình kĩ năng liên kết với search_group này
      const groupWeights = await this.prisma.jobGroupSkillWeight.findMany({
        where: { search_group: defaultMatch.search_group },
        include: { skill: true },
      });

      const categoryMap = new Map<string, number>();

      for (const w of groupWeights) {
        // Chỉ xử lý những skill thực sự nằm trong cấu hình weights của search_group này
        const category = w.skill.category || 'General';
        const currentScore = categoryMap.get(category) || 0;

        const isMissing = missingSkills.some((m) => m.skill_id === w.skill_id);
        const isPartial = partialSkills.some((p) => p.skill_id === w.skill_id);

        let gapImpact = 0;
        if (isMissing) {
          gapImpact = -Number(w.weight_wi) * 10;
        } else if (isPartial) {
          const partialItem = partialSkills.find(
            (p) => p.skill_id === w.skill_id,
          );
          const gapVal = partialItem ? partialItem.gap : 0;
          gapImpact = -Number(gapVal) * 10;
        } else {
          gapImpact = Number(w.weight_wi) * 5;
        }

        categoryMap.set(category, currentScore + gapImpact);
      }

      // 2. Chuyển map thành mảng VÀ FILTER BỎ những thằng gap_score === 0
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
      this.logger.log(
        `Fetching recommended jobs based on match history for user: ${userId}`,
      );

      const user = await this.prisma.user.findUnique({
        where: { user_id: userId },
        select: { default_match_id: true, default_cv_id: true },
      });

      if (!user || !user.default_match_id || !user.default_cv_id) {
        return [];
      }

      const defaultMatch = await this.prisma.cvJobMatch.findUnique({
        where: { match_id: user.default_match_id },
        select: { search_group: true },
      });

      if (!defaultMatch || !defaultMatch.search_group) {
        return [];
      }

      const matchedJobs = await this.prisma.cvJobMatch.findMany({
        where: {
          cv_id: user.default_cv_id,
          search_group: defaultMatch.search_group,
          job_id: { not: null },
        },
        include: {
          job: {
            include: {
              company: true,
              salaries: true,
            },
          },
        },
        orderBy: { match_score: 'desc' },
        take: 5,
      });
      const validMatches = matchedJobs.filter((m) => m.job !== null);

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
    } catch (error: unknown) {
      this.handleError(error, 'Get Recommended Jobs');
      return [];
    }
  }

  // TAB TIẾN ĐỘ: Lấy toàn bộ checklist hoàn thiện hồ sơ và hoạt động gần đây
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

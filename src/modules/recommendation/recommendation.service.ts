import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CareerPathDto,
  CareerPathSkillGapDto,
  PrioritySkillDto,
  RecommendedJobDto,
  SavedReportItemDto,
} from './dto/recommendation.dto';

interface GapSkillDetail {
  skill_id: number | string;
  skill_name: string;
  weight?: number | string;
  similarity?: number | string;
  gap?: number | string;
  category?: string;
}

interface GapReportStructure {
  partially_matched_skills?: GapSkillDetail[];
  missing_skills?: GapSkillDetail[];
}

@Injectable()
export class RecommendationService {
  private readonly logger = new Logger(RecommendationService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 1. LẤY VIỆC LÀM GỢI Ý (Giới hạn bài đăng tuyển dụng đăng trong vòng 1 tháng qua)
   */
  async getRecentRecommendedJobs(userId: string): Promise<RecommendedJobDto[]> {
    try {
      this.logger.log(`Fetching recent recommended jobs for user: ${userId}`);

      const user = await this.prisma.user.findUnique({
        where: { user_id: userId },
        select: {
          default_match_id: true,
          default_cv_id: true,
        },
      });

      if (!user || !user.default_match_id || !user.default_cv_id) {
        return [];
      }

      const defaultMatch = await this.prisma.cvJobMatch.findUnique({
        where: {
          match_id: user.default_match_id,
        },
        select: {
          search_group: true,
        },
      });

      if (!defaultMatch || !defaultMatch.search_group) {
        return [];
      }

      /**
       * 30 ngày gần nhất
       */
      const oneMonthAgo = new Date();
      oneMonthAgo.setDate(oneMonthAgo.getDate() - 30);

      /**
       * =====================================================
       * FLOW 1:
       * lấy từ lịch sử matching thật của user
       * =====================================================
       */
      const matchedJobs = await this.prisma.cvJobMatch.findMany({
        where: {
          cv_id: user.default_cv_id,
          search_group: defaultMatch.search_group,

          job_id: {
            not: null,
          },

          job: {
            scraped_at: {
              gte: oneMonthAgo,
            },
          },
        },

        include: {
          job: {
            include: {
              company: true,
              salaries: true,
            },
          },
        },

        orderBy: {
          match_score: 'desc',
        },

        // lấy dư để lọc duplicate
        take: 20,
      });

      /**
       * Lọc duplicate job_id
       * chỉ giữ match_score cao nhất
       */
      const uniqueMatchesMap = new Map<string, (typeof matchedJobs)[0]>();

      matchedJobs.forEach((m) => {
        if (m.job_id && !uniqueMatchesMap.has(m.job_id.toString())) {
          uniqueMatchesMap.set(m.job_id.toString(), m);
        }
      });

      const validMatches = Array.from(uniqueMatchesMap.values())
        .filter((m) => m.job !== null)
        .slice(0, 5);

      /**
       * Có lịch sử matching thật
       */
      if (validMatches.length > 0) {
        return validMatches.map((m) => {
          const job = m.job!;

          const salary = job.salaries[0];

          let salaryText = 'Thỏa thuận';

          if (salary && (salary.min_salary || salary.max_salary)) {
            salaryText = `${Math.round(
              Number(salary.min_salary || 0),
            )} - ${Math.round(
              Number(salary.max_salary || 0),
            )} ${salary.currency || 'VND'}`;
          }

          return {
            job_id: job.job_id.toString(),

            title: job.title,

            company_name: job.company?.name || 'N/A',

            location: job.location || 'N/A',

            match_rate: `${this.normalizeMatchScore(m.match_score)}% match`,

            salary_text: salaryText,
          };
        });
      }

      /**
       * =====================================================
       * FLOW 2:
       * fallback query raw jobs
       * =====================================================
       */
      this.logger.log(
        `No recent matching history found. Fallback to raw jobs from group: ${defaultMatch.search_group}`,
      );

      const rawJobs = await this.prisma.job.findMany({
        where: {
          job_category: defaultMatch.search_group,

          scraped_at: {
            gte: oneMonthAgo,
          },
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
          salaryText = `${Math.round(
            Number(salary.min_salary || 0),
          )} - ${Math.round(
            Number(salary.max_salary || 0),
          )} ${salary.currency || 'VND'}`;
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

  async getPrioritySkills(
    userId: string,
    limit = 4,
  ): Promise<PrioritySkillDto[]> {
    try {
      this.logger.log(`Fetching priority skills for user: ${userId}`);

      const normalizedLimit = this.normalizeLimit(limit, 4, 10);
      const user = await this.prisma.user.findUnique({
        where: { user_id: userId },
        select: { default_match_id: true },
      });

      if (!user?.default_match_id) return [];

      const defaultMatch = await this.prisma.cvJobMatch.findUnique({
        where: { match_id: user.default_match_id },
        select: {
          gap_report: true,
          search_group: true,
        },
      });

      if (!defaultMatch?.gap_report) return [];

      const gapReport =
        defaultMatch.gap_report as unknown as GapReportStructure;
      const missingSkills = (gapReport.missing_skills || []).map((skill) =>
        this.mapGapSkill(skill, 'Missing' as const),
      );
      const partialSkills = (gapReport.partially_matched_skills || []).map(
        (skill) => this.mapGapSkill(skill, 'Partial' as const),
      );

      const uniqueSkills = new Map<
        number,
        (typeof missingSkills | typeof partialSkills)[number]
      >();

      for (const skill of [...missingSkills, ...partialSkills]) {
        if (!skill.skill_id || !skill.skill_name) continue;

        const current = uniqueSkills.get(skill.skill_id);
        if (
          !current ||
          skill.status === 'Missing' ||
          skill.weight > current.weight
        ) {
          uniqueSkills.set(skill.skill_id, skill);
        }
      }

      const targetSkills = Array.from(uniqueSkills.values());
      if (targetSkills.length === 0) return [];

      const skillIds = targetSkills.map((skill) => skill.skill_id);
      const [skills, jobCounts] = await Promise.all([
        this.prisma.skill.findMany({
          where: { skill_id: { in: skillIds } },
          select: {
            skill_id: true,
            category: true,
          },
        }),
        this.prisma.jobSkill.groupBy({
          by: ['skill_id'],
          where: {
            skill_id: { in: skillIds },
            job: {
              OR: [{ expiry_time: { gte: new Date() } }, { expiry_time: null }],
            },
          },
          _count: { job_id: true },
        }),
      ]);

      const categoryBySkillId = new Map(
        skills.map((skill) => [skill.skill_id, skill.category]),
      );
      const jobCountBySkillId = new Map(
        jobCounts.map((item) => [item.skill_id, item._count.job_id]),
      );

      return targetSkills
        .map((skill) => {
          const jobCount = jobCountBySkillId.get(skill.skill_id) || 0;
          const category =
            skill.category || categoryBySkillId.get(skill.skill_id) || null;

          return {
            skill_id: skill.skill_id,
            skill_name: skill.skill_name,
            category,
            status: skill.status,
            priority: this.getPriority(skill.status, skill.weight, jobCount),
            weight: Number(skill.weight.toFixed(4)),
            similarity: Number(skill.similarity.toFixed(4)),
            job_count: jobCount,
            reason: `${jobCount.toLocaleString('vi-VN')} công việc đang yêu cầu kỹ năng này`,
            impact:
              jobCount > 0
                ? `Có thể mở thêm ${jobCount.toLocaleString('vi-VN')} cơ hội phù hợp hơn`
                : 'Cải thiện điểm khớp trong nhóm nghề mục tiêu',
            timeframe: this.getTimeframe(skill.status, skill.weight),
          };
        })
        .sort((a, b) => {
          const priorityDiff =
            this.getPriorityRank(b.priority) - this.getPriorityRank(a.priority);
          if (priorityDiff !== 0) return priorityDiff;

          if (b.job_count !== a.job_count) return b.job_count - a.job_count;
          return b.weight - a.weight;
        })
        .slice(0, normalizedLimit);
    } catch (error: unknown) {
      this.handleError(error, 'Get Priority Skills');
      throw new BadRequestException('Could not fetch priority skills');
    }
  }

  async getCareerPaths(userId: string, limit = 3): Promise<CareerPathDto[]> {
    try {
      this.logger.log(`Fetching career path recommendations for user: ${userId}`);

      const normalizedLimit = this.normalizeLimit(limit, 3, 6);
      const matches = await this.prisma.cvJobMatch.findMany({
        where: {
          cv: { user_id: userId },
          search_group: { not: null },
        },
        orderBy: [{ match_score: 'desc' }, { created_at: 'desc' }],
        take: 30,
      });

      const bestMatchByGroup = new Map<string, (typeof matches)[number]>();
      for (const match of matches) {
        const searchGroup = match.search_group?.trim();
        if (!searchGroup || bestMatchByGroup.has(searchGroup)) continue;
        bestMatchByGroup.set(searchGroup, match);
      }

      const selectedMatches = Array.from(bestMatchByGroup.entries()).slice(
        0,
        normalizedLimit,
      );

      const careerPaths = await Promise.all(
        selectedMatches.map(async ([searchGroup, match]) => {
          const currentMatch = this.normalizeMatchScore(match.match_score);
          const skillGaps = await this.getCareerPathSkillGaps(match.gap_report);
          const marketStats = await this.getCareerPathMarketStats(searchGroup);
          const learningPath = await this.findRelevantLearningPath(
            searchGroup,
            skillGaps,
          );

          return {
            id: this.toStableId(searchGroup),
            title: this.formatCareerPathTitle(searchGroup),
            search_group: searchGroup,
            current_match: currentMatch,
            target_match: this.getTargetMatch(currentMatch),
            readiness_label: this.getReadinessLabel(currentMatch, skillGaps),
            time_to_ready: this.getCareerPathTimeToReady(
              currentMatch,
              skillGaps,
            ),
            skill_gaps: skillGaps,
            salary_range: marketStats.salaryRange,
            openings_count: marketStats.openingsCount,
            learning_path_title: learningPath?.path_title || null,
            learning_path_id: learningPath?.path_id || null,
            href:
              skillGaps.length > 0
                ? `/roadmap?skill=${encodeURIComponent(skillGaps[0].skill_name)}`
                : '/skill-gap',
          };
        }),
      );

      return careerPaths;
    } catch (error: unknown) {
      this.handleError(error, 'Get Career Paths');
      throw new BadRequestException('Could not fetch career path recommendations');
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
          cv_id: m.cv_id,
        };
      });
    } catch (error: unknown) {
      this.handleError(error, 'Get Saved Reports List');
      throw new BadRequestException('Could not fetch saved reports history');
    }
  }

  private async getCareerPathSkillGaps(
    gapReportRaw: unknown,
    limit = 4,
  ): Promise<CareerPathSkillGapDto[]> {
    const gapReport = (gapReportRaw || {}) as GapReportStructure;
    const missingSkills = (gapReport.missing_skills || []).map((skill) =>
      this.mapGapSkill(skill, 'Missing' as const),
    );
    const partialSkills = (gapReport.partially_matched_skills || []).map(
      (skill) => this.mapGapSkill(skill, 'Partial' as const),
    );

    const uniqueSkills = new Map<
      number,
      (typeof missingSkills | typeof partialSkills)[number]
    >();

    for (const skill of [...missingSkills, ...partialSkills]) {
      if (!skill.skill_id || !skill.skill_name) continue;
      const current = uniqueSkills.get(skill.skill_id);
      if (
        !current ||
        skill.status === 'Missing' ||
        skill.weight > current.weight
      ) {
        uniqueSkills.set(skill.skill_id, skill);
      }
    }

    const targetSkills = Array.from(uniqueSkills.values());
    if (targetSkills.length === 0) return [];

    const skillIds = targetSkills.map((skill) => skill.skill_id);
    const [skills, jobCounts] = await Promise.all([
      this.prisma.skill.findMany({
        where: { skill_id: { in: skillIds } },
        select: { skill_id: true, category: true },
      }),
      this.prisma.jobSkill.groupBy({
        by: ['skill_id'],
        where: {
          skill_id: { in: skillIds },
          job: {
            OR: [{ expiry_time: { gte: new Date() } }, { expiry_time: null }],
          },
        },
        _count: { job_id: true },
      }),
    ]);

    const categoryBySkillId = new Map(
      skills.map((skill) => [skill.skill_id, skill.category]),
    );
    const jobCountBySkillId = new Map(
      jobCounts.map((item) => [item.skill_id, item._count.job_id]),
    );

    return targetSkills
      .map((skill) => {
        const jobCount = jobCountBySkillId.get(skill.skill_id) || 0;
        const category =
          skill.category || categoryBySkillId.get(skill.skill_id) || null;

        return {
          skill_id: skill.skill_id,
          skill_name: skill.skill_name,
          category,
          priority: this.getPriority(skill.status, skill.weight, jobCount),
          weight: skill.weight,
          jobCount,
        };
      })
      .sort((a, b) => {
        const priorityDiff =
          this.getPriorityRank(b.priority) - this.getPriorityRank(a.priority);
        if (priorityDiff !== 0) return priorityDiff;
        if (b.jobCount !== a.jobCount) return b.jobCount - a.jobCount;
        return b.weight - a.weight;
      })
      .slice(0, limit)
      .map(({ skill_id, skill_name, category, priority }) => ({
        skill_id,
        skill_name,
        category,
        priority,
      }));
  }

  private async getCareerPathMarketStats(searchGroup: string): Promise<{
    openingsCount: number;
    salaryRange: string;
  }> {
    const groupCondition = {
      OR: [
        { search_group: { equals: searchGroup, mode: 'insensitive' as const } },
        { job_category: { equals: searchGroup, mode: 'insensitive' as const } },
      ],
    };

    const activeCondition = {
      OR: [{ expiry_time: { gte: new Date() } }, { expiry_time: null }],
    };

    const where = { AND: [groupCondition, activeCondition] };

    const [openingsCount, jobs] = await Promise.all([
      this.prisma.job.count({ where }),
      this.prisma.job.findMany({
        where,
        select: {
          salaries: {
            select: {
              min_salary: true,
              max_salary: true,
              med_salary: true,
              currency: true,
            },
          },
        },
        take: 300,
      }),
    ]);

    const minValues: number[] = [];
    const maxValues: number[] = [];
    let currency = 'VND';

    for (const job of jobs) {
      for (const salary of job.salaries) {
        currency = salary.currency || currency;
        const minSalary = Number(salary.min_salary || salary.med_salary || 0);
        const maxSalary = Number(salary.max_salary || salary.med_salary || 0);
        if (Number.isFinite(minSalary) && minSalary > 0) {
          minValues.push(minSalary);
        }
        if (Number.isFinite(maxSalary) && maxSalary > 0) {
          maxValues.push(maxSalary);
        }
      }
    }

    if (minValues.length === 0 && maxValues.length === 0) {
      return { openingsCount, salaryRange: 'Thỏa thuận' };
    }

    const minSalary =
      minValues.length > 0 ? Math.min(...minValues) : Math.min(...maxValues);
    const maxSalary =
      maxValues.length > 0 ? Math.max(...maxValues) : Math.max(...minValues);

    return {
      openingsCount,
      salaryRange: `${this.formatCurrencyAmount(minSalary)} - ${this.formatCurrencyAmount(maxSalary)} ${currency}`,
    };
  }

  private async findRelevantLearningPath(
    searchGroup: string,
    skillGaps: CareerPathSkillGapDto[],
  ) {
    const keywords = [
      ...skillGaps.map((skill) => skill.skill_name),
      searchGroup,
    ].filter(Boolean);

    if (keywords.length === 0) return null;

    return this.prisma.learningPath.findFirst({
      where: {
        OR: keywords.slice(0, 5).flatMap((keyword) => [
          { skill_key: { contains: keyword, mode: 'insensitive' as const } },
          { path_title: { contains: keyword, mode: 'insensitive' as const } },
        ]),
      },
      select: {
        path_id: true,
        path_title: true,
      },
    });
  }

  private handleError(error: unknown, context: string) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const stack = error instanceof Error ? error.stack : '';
    this.logger.error(
      `RecommendationService ${context} failed: ${message}`,
      stack,
    );
  }

  private mapGapSkill(skill: GapSkillDetail, status: 'Missing' | 'Partial') {
    const similarity =
      status === 'Missing' ? 0 : this.normalizeSimilarity(skill.similarity);

    return {
      skill_id: Number(skill.skill_id),
      skill_name: skill.skill_name,
      weight: Number(skill.weight || 0),
      similarity,
      category: skill.category,
      status,
    };
  }

  private normalizeSimilarity(value?: number | string): number {
    const similarity = Number(value || 0);
    if (!Number.isFinite(similarity)) return 0;

    return similarity > 1 ? similarity / 100 : similarity;
  }

  private normalizeMatchScore(value: unknown): number {
    const score = Number(value || 0);
    if (!Number.isFinite(score)) return 0;
    const normalizedScore = score <= 1 ? score * 100 : score;
    return Math.max(0, Math.min(100, Math.round(normalizedScore)));
  }

  private normalizeLimit(value: unknown, defaultValue: number, max: number) {
    const parsedValue = Number(value);
    const safeValue = Number.isFinite(parsedValue) ? parsedValue : defaultValue;

    return Math.min(Math.max(Math.trunc(safeValue), 1), max);
  }

  private getPriority(
    status: 'Missing' | 'Partial',
    weight: number,
    jobCount: number,
  ): 'critical' | 'high' | 'medium' | 'low' {
    if (status === 'Missing' && (weight >= 0.5 || jobCount >= 100)) {
      return 'critical';
    }
    if (weight >= 0.25 || jobCount >= 50) return 'high';
    if (weight >= 0.1 || jobCount >= 10) return 'medium';
    return 'low';
  }

  private getPriorityRank(priority: 'critical' | 'high' | 'medium' | 'low') {
    const rank = {
      critical: 4,
      high: 3,
      medium: 2,
      low: 1,
    };

    return rank[priority];
  }

  private getTimeframe(status: 'Missing' | 'Partial', weight: number): string {
    if (status === 'Partial') return weight >= 0.25 ? '2-4 tuần' : '1-2 tuần';
    if (weight >= 0.5) return '2-3 tháng';
    if (weight >= 0.25) return '1-2 tháng';
    return '3-4 tuần';
  }

  private getTargetMatch(currentMatch: number): number {
    return Math.min(95, Math.max(80, currentMatch + 10));
  }

  private getReadinessLabel(
    currentMatch: number,
    skillGaps: CareerPathSkillGapDto[],
  ): string {
    if (currentMatch >= 85 && skillGaps.length <= 1) return 'Sẵn sàng cao';
    if (currentMatch >= 70) return 'Cần bổ sung trọng tâm';
    if (currentMatch >= 50) return 'Có nền tảng phù hợp';
    return 'Cần xây nền tảng';
  }

  private getCareerPathTimeToReady(
    currentMatch: number,
    skillGaps: CareerPathSkillGapDto[],
  ): string {
    const criticalCount = skillGaps.filter(
      (skill) => skill.priority === 'critical',
    ).length;
    const highCount = skillGaps.filter((skill) => skill.priority === 'high')
      .length;

    if (currentMatch >= 85 && criticalCount === 0) return 'Có thể bắt đầu ngay';
    if (criticalCount >= 2) return '2-3 tháng';
    if (criticalCount === 1 || highCount >= 2) return '1-2 tháng';
    if (skillGaps.length > 0) return '3-4 tuần';
    return 'Có thể bắt đầu ngay';
  }

  private formatCareerPathTitle(searchGroup: string): string {
    return searchGroup
      .replace(/[_-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .split(' ')
      .map((part) =>
        part.length <= 3
          ? part.toUpperCase()
          : part.charAt(0).toUpperCase() + part.slice(1),
      )
      .join(' ');
  }

  private toStableId(value: string): string {
    return value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  private formatCurrencyAmount(value: number): string {
    return Math.round(value).toLocaleString('vi-VN');
  }
}

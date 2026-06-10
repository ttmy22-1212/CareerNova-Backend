import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
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

            match_rate: `${Math.round(Number(m.match_score || 0))}% match`,

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
}

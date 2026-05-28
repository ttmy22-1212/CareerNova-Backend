import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  SkillGapStatisticsDto,
  CategoryGapDto,
  RadarSkillPointDto,
  CategoryBreakdownDto,
  SkillBreakdownItemDto,
} from './dto/skill-gap.dto';

interface MatchedSkillDetail {
  skill_id: number;
  skill_name: string;
  weight: number;
  similarity: number;
  contribution: number;
  category?: string;
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
  category?: string;
}

interface GapReportStructure {
  matched_skills?: MatchedSkillDetail[];
  partially_matched_skills: PartialSkillDetail[];
  missing_skills: MissingSkillDetail[];
}

interface SkillDetail {
  skill_id: number;
  skill_name: string;
  weight: number;
  similarity: number;
  gap: number;
  category?: string;
}

@Injectable()
export class SkillGapService {
  private readonly logger = new Logger(SkillGapService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Helper dùng chung lấy bản ghi CvJobMatch mặc định
   */
  private async getDefaultMatchOrThrow(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { user_id: userId },
      select: { default_match_id: true },
    });

    if (!user || !user.default_match_id) {
      throw new NotFoundException(
        'Vui lòng kích hoạt lượt matching mặc định để xem phân tích kỹ năng.',
      );
    }

    const match = await this.prisma.cvJobMatch.findUnique({
      where: { match_id: user.default_match_id },
      include: {
        job: { select: { title: true } },
      },
    });

    if (!match) {
      throw new NotFoundException(
        'Không tìm thấy dữ liệu phân tích matching mặc định tương ứng.',
      );
    }

    return match;
  }

  /**
   * 1. SKILL GAP STATISTICS
   * - Đếm số lượng core / priority gaps
   * - Tính theo weight thực tế
   */
  async getSkillGapStatistics(userId: string): Promise<SkillGapStatisticsDto> {
    try {
      this.logger.log(`Calculating skill gap statistics for user: ${userId}`);

      const match = await this.getDefaultMatchOrThrow(userId);

      const gapReport = (match.gap_report as unknown as GapReportStructure) || {
        partially_matched_skills: [],
        missing_skills: [],
      };

      const rawScore = Number(match.match_score || 0);

      const finalScore =
        rawScore <= 1 ? Math.round(rawScore * 100) : Math.round(rawScore);

      const allGapSkills = [
        ...(gapReport.partially_matched_skills || []),
        ...(gapReport.missing_skills || []),
      ];

      let coreGapsCount = 0;
      let priorityGapsCount = 0;

      let coreGapScore = 0;
      let priorityGapScore = 0;

      for (const skill of allGapSkills) {
        const weight = Number(skill.weight || 0);
        const gap = Number(skill.gap || 1);

        const severity = weight * gap;

        // >= 0.5 => Core
        if (weight >= 0.5) {
          coreGapsCount++;
          coreGapScore += severity;
        }
        // >= 0.2 => Priority
        else if (weight >= 0.2) {
          priorityGapsCount++;
          priorityGapScore += severity;
        }
      }

      return {
        match_score: finalScore,

        core_gaps_count: coreGapsCount,
        priority_gaps_count: priorityGapsCount,

        // optional field nếu DTO có
        // core_gap_score: Number(coreGapScore.toFixed(2)),
        // priority_gap_score: Number(priorityGapScore.toFixed(2)),
      };
    } catch (error: unknown) {
      this.handleError(error, 'Get Skill Gap Statistics');

      throw new BadRequestException('Could not fetch skill gap statistics');
    }
  }

  /**
   * 2. CATEGORY GAP DATA
   * - Công thức chuẩn:
   *   gap = user capability - market expectation
   * - Weighted average theo market_weight
   */
  async getCategoryGapsData(userId: string): Promise<CategoryGapDto[]> {
    try {
      this.logger.log(`Fetching category gap data for user: ${userId}`);

      const match = await this.getDefaultMatchOrThrow(userId);

      let baseSkills: Array<{
        skill_id: number;
        category: string;
        market_weight: number;
      }> = [];

      // CV JOB
      if (match.match_type === 'cv_job' && match.job_id) {
        const jobSkills = await this.prisma.jobSkill.findMany({
          where: {
            job_id: match.job_id,
          },
          include: {
            skill: true,
          },
        });

        baseSkills = jobSkills.map((js) => ({
          skill_id: js.skill_id,
          category: js.skill.category || 'General',
          market_weight: Number(js.similarity_score || 1),
        }));
      }

      // SEARCH GROUP
      else if (match.search_group) {
        const groupSkills = await this.prisma.jobGroupSkillWeight.findMany({
          where: {
            search_group: match.search_group,
          },
          include: {
            skill: true,
          },
        });

        baseSkills = groupSkills.map((gw) => ({
          skill_id: gw.skill_id,
          category: gw.skill.category || 'General',
          market_weight: Number(gw.weight_wi),
        }));
      }

      if (baseSkills.length === 0) {
        return [];
      }

      const gapReport = (match.gap_report as unknown as GapReportStructure) || {
        partially_matched_skills: [],
        missing_skills: [],
      };

      const partialSkills = gapReport.partially_matched_skills || [];

      const missingSkills = gapReport.missing_skills || [];

      const categoryMap = new Map<
        string,
        {
          weightedUser: number;
          weightedMarket: number;
          totalWeight: number;
        }
      >();

      for (const bs of baseSkills) {
        const category = bs.category;
        const marketRate = Math.round(bs.market_weight * 100);

        let userRate = marketRate;

        const missingItem = missingSkills.find(
          (m) => Number(m.skill_id) === Number(bs.skill_id),
        );

        const partialItem = partialSkills.find(
          (p) => Number(p.skill_id) === Number(bs.skill_id),
        );

        // Missing
        if (missingItem) {
          userRate = 0;
        }

        // Partial
        else if (partialItem) {
          const similarity =
            typeof partialItem.similarity === 'number'
              ? partialItem.similarity
              : 0;

          userRate = Math.round(similarity * marketRate);
        }

        if (!categoryMap.has(category)) {
          categoryMap.set(category, {
            weightedUser: 0,
            weightedMarket: 0,
            totalWeight: 0,
          });
        }

        const group = categoryMap.get(category)!;

        group.weightedUser += userRate * bs.market_weight;

        group.weightedMarket += marketRate * bs.market_weight;

        group.totalWeight += bs.market_weight;
      }

      return Array.from(categoryMap.entries()).map(([category, data]) => {
        const avgUser = Math.round(data.weightedUser / data.totalWeight);

        const avgMarket = Math.round(data.weightedMarket / data.totalWeight);

        const gapScore = avgUser - avgMarket;

        return {
          category,
          gap_score: gapScore,
        };
      });
    } catch (error: unknown) {
      this.handleError(error, 'Get Category Gaps Data');

      return [];
    }
  }

  /**
   * 3. DỮ LIỆU BIỂU ĐỒ RADAR LỌC THEO CATEGORY TRUYỀN VÀO (Giống hàm getSkillsRadarData gốc)
   */
  async getSkillsRadarData(
    userId: string,
    category: string,
  ): Promise<RadarSkillPointDto[]> {
    try {
      this.logger.log(
        `Fetching radar data for category "${category}" and user ${userId}`,
      );

      const match = await this.getDefaultMatchOrThrow(userId);

      let baseSkills: Array<{
        skill_id: number;
        skill_name: string;
        market_weight: number;
      }> = [];

      if (match.match_type === 'cv_job' && match.job_id) {
        const jobSkills = await this.prisma.jobSkill.findMany({
          where: {
            job_id: match.job_id,
            skill: {
              category: {
                equals: category,
                mode: 'insensitive',
              },
            },
          },
          include: {
            skill: true,
          },
        });

        baseSkills = jobSkills.map((js) => ({
          skill_id: js.skill_id,
          skill_name: js.skill.skill_name,
          market_weight: Number(js.similarity_score || 1),
        }));
      } else if (match.search_group) {
        const groupSkills = await this.prisma.jobGroupSkillWeight.findMany({
          where: {
            search_group: match.search_group,
            skill: {
              category: {
                equals: category,
                mode: 'insensitive',
              },
            },
          },
          include: {
            skill: true,
          },
        });

        baseSkills = groupSkills.map((gw) => ({
          skill_id: gw.skill_id,
          skill_name: gw.skill.skill_name,
          market_weight: Number(gw.weight_wi),
        }));
      }

      if (baseSkills.length === 0) {
        return [];
      }

      const gapReport = (match.gap_report as unknown as GapReportStructure) || {
        partially_matched_skills: [],
        missing_skills: [],
      };

      return baseSkills.map((bs) => {
        const marketRate = Math.round(bs.market_weight * 100);

        const { userRate } = this.calculateSkillRate(
          bs.skill_id,
          marketRate,
          gapReport,
        );

        return {
          skill_name: bs.skill_name,
          user_score: userRate,
          market_score: marketRate,
        };
      });
    } catch (error: unknown) {
      this.handleError(error, 'Get Skills Radar Data');
      return [];
    }
  }

  /**
   * 4. BẢNG CHI TIẾT TOÀN BỘ KỸ NĂNG (Detailed Breakdown - Bản lấy ALL của Radar)
   */

  async getSkillsBreakdownData(
    userId: string,
  ): Promise<CategoryBreakdownDto[]> {
    try {
      this.logger.log(`Fetching structured skill breakdown for user ${userId}`);

      const match = await this.getDefaultMatchOrThrow(userId);

      let baseSkills: Array<{
        skill_id: number;
        skill_name: string;
        category: string;
        market_weight: number;
      }> = [];

      if (match.match_type === 'cv_job' && match.job_id) {
        const jobSkills = await this.prisma.jobSkill.findMany({
          where: {
            job_id: match.job_id,
          },
          include: {
            skill: true,
          },
        });
        baseSkills = jobSkills.map((js) => ({
          skill_id: js.skill_id,
          skill_name: js.skill.skill_name,
          category: js.skill.category || 'General',
          market_weight: Number(js.similarity_score || 1),
        }));
      } else if (match.search_group) {
        const groupSkills = await this.prisma.jobGroupSkillWeight.findMany({
          where: {
            search_group: match.search_group,
          },
          include: {
            skill: true,
          },
        });

        baseSkills = groupSkills.map((gw) => ({
          skill_id: gw.skill_id,
          skill_name: gw.skill.skill_name,
          category: gw.skill.category || 'General',
          market_weight: Number(gw.weight_wi),
        }));
      }

      if (baseSkills.length === 0) {
        return [];
      }

      const gapReport = (match.gap_report as unknown as GapReportStructure) || {
        partially_matched_skills: [],
        missing_skills: [],
      };

      const breakdownMap = new Map<
        string,
        {
          totalUserRate: number;
          totalMarketRate: number;
          totalGap: number;
          skills: SkillBreakdownItemDto[];
        }
      >();

      for (const bs of baseSkills) {
        const category = bs.category;
        const marketRate = Math.round(bs.market_weight * 100);

        const { userRate, status } = this.calculateSkillRate(
          bs.skill_id,
          marketRate,
          gapReport,
        );

        const skillGap = userRate - marketRate;

        if (!breakdownMap.has(category)) {
          breakdownMap.set(category, {
            totalUserRate: 0,
            totalMarketRate: 0,
            totalGap: 0,
            skills: [],
          });
        }

        const group = breakdownMap.get(category)!;

        group.totalUserRate += userRate;
        group.totalMarketRate += marketRate;
        group.totalGap += skillGap;

        group.skills.push({
          skill_id: bs.skill_id,
          skill_name: bs.skill_name,
          user_rate: userRate,
          market_rate: marketRate,
          status,
        });
      }

      return Array.from(breakdownMap.entries()).map(([categoryName, data]) => {
        const count = data.skills.length;

        const avgUser = Math.round(data.totalUserRate / count);
        const avgMarket = Math.round(data.totalMarketRate / count);
        const avgGap = Math.round(data.totalGap / count);

        return {
          category_name: categoryName,
          gap_label: avgGap >= 0 ? `+${avgGap}pt gap` : `${avgGap}pt gap`,
          user_rate_avg: avgUser,
          market_rate_avg: avgMarket,
          skills: data.skills,
        };
      });
    } catch (error: unknown) {
      this.handleError(error, 'Get Skills Breakdown Data');

      throw new BadRequestException(
        'Could not fetch structural skills breakdown table data',
      );
    }
  }

  private calculateSkillRate(
    skillId: number,
    marketRate: number,
    gapReport: GapReportStructure,
  ): {
    userRate: number;
    status: 'Proficient' | 'Missing';
  } {
    const partialSkills = gapReport.partially_matched_skills || [];
    const missingSkills = gapReport.missing_skills || [];

    const partialItem = partialSkills.find(
      (p) => Number(p.skill_id) === Number(skillId),
    );

    const missingItem = missingSkills.find(
      (m) => Number(m.skill_id) === Number(skillId),
    );

    // Missing skill
    if (missingItem) {
      return {
        userRate: 0,
        status: 'Missing',
      };
    }

    // Partial skill
    if (partialItem) {
      const similarity =
        typeof partialItem.similarity === 'number' ? partialItem.similarity : 0;

      const userRate = Math.round(similarity * marketRate);

      return {
        userRate,
        status: userRate >= marketRate ? 'Proficient' : 'Missing',
      };
    }

    // Nếu không nằm trong partial + missing
    // => matched hoàn toàn
    return {
      userRate: marketRate,
      status: 'Proficient',
    };
  }

  private handleError(error: unknown, context: string) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const stack = error instanceof Error ? error.stack : '';
    this.logger.error(`SkillGapService ${context} failed: ${message}`, stack);
  }
}

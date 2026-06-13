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
  SkillGapLearningCourseDto,
  SkillGapLearningRecommendationDto,
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

      const finalScore = this.normalizeMatchScore(match.match_score);

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
   * - Chỉ lấy category có skill xuất hiện trong default matching
   * - Score âm: thiếu skill theo trọng số category
   * - Score dương: có skill theo similarity và trọng số category
   */
  async getCategoryGapsData(
    userId: string,
    limit = 10,
  ): Promise<CategoryGapDto[]> {
    try {
      this.logger.log(`Fetching category gap data for user: ${userId}`);

      const parsedLimit = Number(limit);
      const normalizedLimit = Math.min(
        Math.max(
          Math.trunc(Number.isFinite(parsedLimit) ? parsedLimit : 10),
          1,
        ),
        10,
      );

      const match = await this.getDefaultMatchOrThrow(userId);

      let baseSkills: Array<{
        skill_id: number;
        skill_name: string;
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
          skill_name: js.skill.skill_name,
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

      const rawRadarData = match.radar_data as unknown;
      const matchedSkills = Array.isArray(rawRadarData)
        ? (rawRadarData as MatchedSkillDetail[])
        : gapReport.matched_skills || [];
      const partialSkills = gapReport.partially_matched_skills || [];
      const missingSkills = gapReport.missing_skills || [];

      const skillStateMap = new Map<
        number,
        {
          status: 'matched' | 'partial' | 'missing';
          similarity: number;
          weight: number;
          matchedVia?: string;
        }
      >();

      for (const skill of matchedSkills) {
        skillStateMap.set(Number(skill.skill_id), {
          status: 'matched',
          similarity: this.normalizeSimilarity(skill.similarity, 1),
          weight: Number(skill.weight || 0),
        });
      }

      for (const skill of partialSkills) {
        skillStateMap.set(Number(skill.skill_id), {
          status: 'partial',
          similarity: this.normalizeSimilarity(skill.similarity),
          weight: Number(skill.weight || 0),
          matchedVia: skill.matched_via,
        });
      }

      for (const skill of missingSkills) {
        skillStateMap.set(Number(skill.skill_id), {
          status: 'missing',
          similarity: 0,
          weight: Number(skill.weight || 0),
        });
      }

      if (skillStateMap.size === 0) {
        return [];
      }

      const categoryMap = new Map<
        string,
        {
          weightedScore: number;
          weightedUserRate: number;
          totalWeight: number;
          skillCount: number;
          skills: Array<{
            skill_id: number;
            skill_name: string;
            weight: number;
            user_rate: number;
            market_rate: number;
            similarity: number;
            gap_score: number;
            status: 'Matched' | 'Partial' | 'Missing';
            matched_via?: string;
          }>;
        }
      >();

      for (const bs of baseSkills) {
        const state = skillStateMap.get(Number(bs.skill_id));
        if (!state) {
          continue;
        }

        const category = bs.category;
        const baseWeight = Number(bs.market_weight);
        const stateWeight = Number(state.weight);
        const weight =
          Number.isFinite(baseWeight) && baseWeight > 0
            ? baseWeight
            : Number.isFinite(stateWeight) && stateWeight > 0
              ? stateWeight
              : 1;

        if (!categoryMap.has(category)) {
          categoryMap.set(category, {
            totalWeight: 0,
            weightedScore: 0,
            weightedUserRate: 0,
            skillCount: 0,
            skills: [],
          });
        }

        const group = categoryMap.get(category)!;
        const signedContribution =
          state.status === 'missing' ? -weight : weight * state.similarity;
        const userRate =
          state.status === 'missing'
            ? 0
            : Math.round(this.normalizeSimilarity(state.similarity) * 100);
        const skillGapScore = Number(
          ((signedContribution / weight) * 100).toFixed(1),
        );

        group.weightedScore += signedContribution;
        group.weightedUserRate += userRate * weight;
        group.totalWeight += weight;
        group.skillCount += 1;
        group.skills.push({
          skill_id: bs.skill_id,
          skill_name: bs.skill_name,
          weight: Number(weight.toFixed(4)),
          user_rate: userRate,
          market_rate: 100,
          similarity: Number(state.similarity.toFixed(4)),
          gap_score: skillGapScore,
          status:
            state.status === 'missing'
              ? 'Missing'
              : state.status === 'partial'
                ? 'Partial'
                : 'Matched',
          matched_via: state.matchedVia,
        });
      }

      return Array.from(categoryMap.entries())
        .map(([category, data]) => {
          const gapScore =
            data.totalWeight > 0
              ? Number(
                  ((data.weightedScore / data.totalWeight) * 100).toFixed(1),
                )
              : 0;
          const userRateAvg =
            data.totalWeight > 0
              ? Math.round(data.weightedUserRate / data.totalWeight)
              : 0;

          return {
            category,
            gap_score: gapScore,
            gap_label: this.formatSignedPoint(gapScore),
            user_rate_avg: userRateAvg,
            market_rate_avg: 100,
            skills: data.skills.sort((a, b) => {
              if (a.status !== b.status) {
                const order = { Missing: 0, Partial: 1, Matched: 2 };
                return order[a.status] - order[b.status];
              }
              return b.weight - a.weight;
            }),
            totalWeight: data.totalWeight,
            skillCount: data.skillCount,
          };
        })
        .sort((a, b) => {
          if (b.totalWeight !== a.totalWeight) {
            return b.totalWeight - a.totalWeight;
          }
          if (b.skillCount !== a.skillCount) {
            return b.skillCount - a.skillCount;
          }
          return Math.abs(b.gap_score) - Math.abs(a.gap_score);
        })
        .slice(0, normalizedLimit)
        .map(
          ({
            category,
            gap_score,
            gap_label,
            user_rate_avg,
            market_rate_avg,
            skills,
          }) => ({
            category,
            gap_score,
            gap_label,
            user_rate_avg,
            market_rate_avg,
            skills,
          }),
        );
    } catch (error: unknown) {
      this.handleError(error, 'Get Category Gaps Data');

      return [];
    }
  }

  /**
   * 3. LEARNING PATHS ĐỀ XUẤT
   * - Dựa trên missing/partial skills của default matching
   * - Trả thêm course/path chi tiết để UI có thể mở rộng ngay tại Skill Gap
   */
  async getRecommendedLearningPaths(
    userId: string,
    limit = 3,
  ): Promise<SkillGapLearningRecommendationDto[]> {
    try {
      this.logger.log(`Fetching skill gap learning paths for user: ${userId}`);

      const parsedLimit = Number(limit);
      const normalizedLimit = Math.min(
        Math.max(Math.trunc(Number.isFinite(parsedLimit) ? parsedLimit : 3), 1),
        6,
      );

      const match = await this.getDefaultMatchOrThrow(userId);
      const gapReport = (match.gap_report as unknown as GapReportStructure) || {
        partially_matched_skills: [],
        missing_skills: [],
      };

      const missingSkills = (gapReport.missing_skills || []).map((skill) => ({
        skill_id: Number(skill.skill_id),
        skill_name: skill.skill_name,
        weight: Number(skill.weight || 0),
        similarity: 0,
        status: 'Missing' as const,
        category: skill.category,
      }));
      const partialSkills = (gapReport.partially_matched_skills || []).map(
        (skill) => ({
          skill_id: Number(skill.skill_id),
          skill_name: skill.skill_name,
          weight: Number(skill.weight || 0),
          similarity: this.normalizeSimilarity(skill.similarity),
          status: 'Partial' as const,
          category: skill.category,
        }),
      );

      const targetSkills = [...missingSkills, ...partialSkills]
        .filter((skill) => skill.skill_id && skill.skill_name)
        .sort((a, b) => {
          if (b.weight !== a.weight) {
            return b.weight - a.weight;
          }
          return a.similarity - b.similarity;
        })
        .slice(0, normalizedLimit);

      if (targetSkills.length === 0) {
        return [];
      }

      const skillCategories = await this.prisma.skill.findMany({
        where: {
          skill_id: {
            in: targetSkills.map((skill) => skill.skill_id),
          },
        },
        select: {
          skill_id: true,
          category: true,
        },
      });
      const categoryBySkillId = new Map(
        skillCategories.map((skill) => [
          Number(skill.skill_id),
          skill.category || 'General',
        ]),
      );

      const userSaved = await this.prisma.savedCourse.findMany({
        where: { user_id: userId, status: 'saved' },
        select: { course_id: true },
      });
      const savedCourseIds = new Set(
        userSaved.map((course) => course.course_id),
      );

      const recommendedCourses = await this.prisma.course.findMany({
        where: { is_recommended: true },
        take: 50,
      });

      return await Promise.all(
        targetSkills.map(async (skill) => {
          const paths = await this.prisma.learningPath.findMany({
            where: {
              OR: [
                {
                  skill_key: {
                    contains: skill.skill_name,
                    mode: 'insensitive',
                  },
                },
                {
                  path_title: {
                    contains: skill.skill_name,
                    mode: 'insensitive',
                  },
                },
              ],
            },
            take: 2,
            include: {
              courses_in_path: {
                orderBy: { sort_order: 'asc' },
                include: { course: true },
              },
            },
          });

          const pathCourses = paths.flatMap((path) =>
            path.courses_in_path.map((pathCourse) => pathCourse.course),
          );
          const directCourses = recommendedCourses.filter((course) =>
            this.courseMatchesSkill(course, skill.skill_name),
          );

          const courseMap = new Map<
            string,
            (typeof recommendedCourses)[number]
          >();
          [...pathCourses, ...directCourses, ...recommendedCourses].forEach(
            (course) => {
              if (courseMap.size < 3 && !courseMap.has(course.course_id)) {
                courseMap.set(course.course_id, course);
              }
            },
          );

          const courses = Array.from(courseMap.values()).map((course) =>
            this.mapLearningCourse(course, savedCourseIds),
          );
          const category =
            skill.category ||
            categoryBySkillId.get(skill.skill_id) ||
            'General';
          const userRate = Math.round(
            this.normalizeSimilarity(skill.similarity) * 100,
          );

          return {
            id: String(skill.skill_id || skill.skill_name),
            skill_name: skill.skill_name,
            category,
            priority: this.getLearningPriority(skill.weight),
            status: skill.status,
            weight: Number(skill.weight.toFixed(4)),
            user_rate: userRate,
            estimated_time: this.getEstimatedLearningTime(skill.weight),
            impact: this.getLearningImpactLabel(skill.weight),
            jobs_requiring: `Trọng số ${Math.round(skill.weight * 100)}%`,
            started: courses.some((course) => course.is_saved),
            courses,
            paths: paths.map((path) => ({
              id: path.path_id,
              title: path.path_title,
              description: path.path_description,
              duration: path.estimated_duration_months,
              difficulty: path.path_level,
              icon: this.getPathIcon(path.path_icon),
              courses: path.courses_in_path.map((pathCourse) =>
                this.mapLearningCourse(pathCourse.course, savedCourseIds),
              ),
            })),
            steps: this.buildLearningSteps(skill.skill_name, paths.length > 0),
          };
        }),
      );
    } catch (error: unknown) {
      this.handleError(error, 'Get Recommended Learning Paths');
      return [];
    }
  }

  /**
   * 4. DỮ LIỆU BIỂU ĐỒ RADAR LỌC THEO CATEGORY TRUYỀN VÀO (Giống hàm getSkillsRadarData gốc)
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

  private normalizeSimilarity(value: unknown, fallback = 0): number {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) {
      return fallback;
    }

    const normalizedValue =
      numericValue > 1 ? numericValue / 100 : numericValue;
    return Math.min(Math.max(normalizedValue, 0), 1);
  }

  private normalizeMatchScore(value: unknown): number {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) {
      return 0;
    }

    const normalizedValue =
      numericValue <= 1 ? numericValue * 100 : numericValue;
    return Math.min(Math.max(Math.round(normalizedValue), 0), 100);
  }

  private formatSignedPoint(value: number): string {
    const roundedValue = Number(value.toFixed(1));
    return `${roundedValue > 0 ? '+' : ''}${roundedValue}pt`;
  }

  private mapLearningCourse(
    course: {
      course_id: string;
      course_title: string;
      provider_name: string;
      duration_hours: number;
      rating?: { toNumber?: () => number } | number | null;
      total_learners?: string | null;
      price?: { toNumber?: () => number } | number | null;
      thumbnail_icon?: string | null;
      skills_tags?: string[];
      source_url?: string | null;
    },
    savedCourseIds: Set<string>,
  ): SkillGapLearningCourseDto {
    return {
      id: course.course_id,
      title: course.course_title,
      provider: course.provider_name,
      duration: `${course.duration_hours}h`,
      level: 'Intermediate',
      rating: this.decimalToNumber(course.rating, 4.5),
      learners: this.parseLearners(course.total_learners),
      progress: savedCourseIds.has(course.course_id) ? 100 : 0,
      is_saved: savedCourseIds.has(course.course_id),
      skills: course.skills_tags || [],
      price: this.decimalToNumber(course.price, 0),
      image: this.getCourseImage(course.thumbnail_icon),
      source_url: course.source_url || undefined,
    };
  }

  private courseMatchesSkill(
    course: { course_title: string; skills_tags?: string[] },
    skillName: string,
  ): boolean {
    const normalizedSkill = skillName.toLowerCase();
    return (
      course.course_title.toLowerCase().includes(normalizedSkill) ||
      (course.skills_tags || []).some((tag) =>
        tag.toLowerCase().includes(normalizedSkill),
      )
    );
  }

  private parseLearners(value?: string | null): number {
    if (!value) {
      return 45000;
    }

    if (value.includes('K')) {
      return Math.round(parseFloat(value.replace('K', '')) * 1000);
    }

    if (value.includes('M')) {
      return Math.round(parseFloat(value.replace('M', '')) * 1000000);
    }

    const numericValue = Number(value.replace(/,/g, ''));
    return Number.isFinite(numericValue) ? numericValue : 45000;
  }

  private decimalToNumber(
    value: { toNumber?: () => number } | number | null | undefined,
    fallback: number,
  ): number {
    if (typeof value === 'number') {
      return value;
    }

    if (value && typeof value.toNumber === 'function') {
      return value.toNumber();
    }

    return fallback;
  }

  private getCourseImage(icon?: string | null): string {
    switch (icon?.toLowerCase()) {
      case 'triangle':
        return '📘';
      case 'circle':
        return '🟢';
      case 'square':
        return '🧩';
      default:
        return '📚';
    }
  }

  private getPathIcon(iconText: string | null): string {
    switch (iconText?.toLowerCase()) {
      case 'rocket':
        return '🚀';
      case 'brain':
        return '🧠';
      case 'laptop':
        return '💻';
      case 'database':
        return '🗄️';
      default:
        return '📊';
    }
  }

  private getLearningPriority(
    weight: number,
  ): 'critical' | 'high' | 'medium' | 'low' {
    if (weight >= 0.5) {
      return 'critical';
    }
    if (weight >= 0.25) {
      return 'high';
    }
    if (weight >= 0.1) {
      return 'medium';
    }
    return 'low';
  }

  private getEstimatedLearningTime(weight: number): string {
    if (weight >= 0.5) {
      return '3-4 months';
    }
    if (weight >= 0.25) {
      return '2-3 months';
    }
    return '4-8 weeks';
  }

  private getLearningImpactLabel(weight: number): string {
    const impact = Math.min(Math.max(Math.round(weight * 100), 8), 40);
    return `+${impact}% job matches`;
  }

  private buildLearningSteps(skillName: string, hasPath: boolean): string[] {
    if (hasPath) {
      return [
        `Hoàn thành khóa nền tảng về ${skillName}`,
        'Thực hành theo project trong lộ trình',
        'Lưu khóa học phù hợp để theo dõi tiến độ',
        'Cập nhật CV sau khi hoàn thành kỹ năng',
      ];
    }

    return [
      `Ôn nền tảng ${skillName}`,
      'Hoàn thành ít nhất một khóa học gợi ý',
      'Làm một project nhỏ để chứng minh kỹ năng',
      'Cập nhật CV và chạy lại matching',
    ];
  }

  private handleError(error: unknown, context: string) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const stack = error instanceof Error ? error.stack : '';
    this.logger.error(`SkillGapService ${context} failed: ${message}`, stack);
  }
}

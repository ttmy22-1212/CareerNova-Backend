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
   * 1. LẤY DỮ LIỆU THỐNG KÊ (STATISTICS CARDS)
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

      let coreGapsCount = 0;
      let priorityGapsCount = 0;
      const allGaps = [
        ...gapReport.partially_matched_skills,
        ...gapReport.missing_skills,
      ];

      allGaps.forEach((skillItem) => {
        const skill = skillItem as { weight: number };
        const weightPercentage = skill.weight * 100;
        if (weightPercentage > 50) {
          coreGapsCount++;
        } else if (weightPercentage >= 20 && weightPercentage <= 50) {
          priorityGapsCount++;
        }
      });

      return {
        match_score: finalScore,
        core_gaps_count: coreGapsCount,
        priority_gaps_count: priorityGapsCount,
      };
    } catch (error: unknown) {
      this.handleError(error, 'Get Statistics');
      throw new BadRequestException(
        'Could not fetch skill gap statistics data',
      );
    }
  }

  /**
   * 2. DỮ LIỆU BIỂU ĐỒ SO SÁNH DANH MỤC (Giống hàm getSkillsChartData gốc)
   */
  async getCategoryGapsData(userId: string): Promise<CategoryGapDto[]> {
    try {
      this.logger.log(`Fetching category gaps chart for user: ${userId}`);

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

      // Khởi tạo mảng lưu trữ kỹ năng làm mốc đối chiếu chuẩn từ database
      let baseSkills: Array<{
        skill_id: number;
        category: string;
        weight: number;
      }> = [];

      // LUỒNG 1: Nếu khớp theo JOB cụ thể (CV Match)
      if (defaultMatch.job_id) {
        const jobSkills = await this.prisma.jobSkill.findMany({
          where: { job_id: defaultMatch.job_id },
          include: { skill: true },
        });
        baseSkills = jobSkills.map((js) => ({
          skill_id: js.skill_id,
          category: js.skill.category || 'General', // Giữ nguyên fallback gốc từ file dashboard của bạn
          weight: 1.0,
        }));
      }
      // LUỒNG 2: Nếu khớp theo nhóm ngành (Role Benchmark)
      else if (defaultMatch.search_group) {
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

      // Chạy vòng lặp tính toán gap_score đúng hệt như dashboard
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
          const gapVal = partialItem ? (partialItem as { gap: number }).gap : 0;
          gapImpact = -Number(gapVal) * 10;
        } else {
          gapImpact = bs.weight * 5;
        }

        categoryMap.set(category, currentScore + gapImpact);
      }

      // Trả về đúng cấu trúc và filter chặn các group không biến động
      return Array.from(categoryMap.entries())
        .map(([category, score]) => ({
          category,
          gap_score: Number(score.toFixed(1)),
        }))
        .filter((item) => item.gap_score !== 0);
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
        `Fetching skills radar chart data for category "${category}" and user: ${userId}`,
      );

      const user = await this.prisma.user.findUnique({
        where: { user_id: userId },
        select: { default_match_id: true },
      });

      if (!user || !user.default_match_id) return [];

      const defaultMatch = await this.prisma.cvJobMatch.findUnique({
        where: { match_id: user.default_match_id },
        select: {
          radar_data: true,
          gap_report: true,
          search_group: true,
          job_id: true,
          match_type: true,
        },
      });

      if (!defaultMatch) return [];

      // 1. Lấy danh sách kỹ năng gốc thuộc nhóm ngành/Job và phải lọc đúng theo CATEGORY truyền vào từ DB
      let baseSkills: Array<{
        skill_id: number;
        skill_name: string;
        market_weight: number;
      }> = [];

      if (defaultMatch.match_type === 'cv_job' && defaultMatch.job_id) {
        // Luồng Job cụ thể: Lấy các skill của Job thuộc category này
        const jobSkills = await this.prisma.jobSkill.findMany({
          where: {
            job_id: defaultMatch.job_id,
            skill: { category: category }, // Lọc an toàn bằng câu lệnh DB, không sợ lỗi chuỗi toLowerCase()
          },
          include: { skill: true },
        });
        baseSkills = jobSkills.map((js) => ({
          skill_id: js.skill_id,
          skill_name: js.skill.skill_name,
          market_weight: 1.0,
        }));
      } else if (defaultMatch.search_group) {
        // Luồng Search Group Benchmark: Lấy cấu hình weights ngành thuộc category này
        const groupWeights = await this.prisma.jobGroupSkillWeight.findMany({
          where: {
            search_group: defaultMatch.search_group,
            skill: { category: category }, // Lọc an toàn bằng câu lệnh DB
          },
          include: { skill: true },
        });
        baseSkills = groupWeights.map((gw) => ({
          skill_id: gw.skill_id,
          skill_name: gw.skill.skill_name,
          market_weight: Number(gw.weight_wi),
        }));
      }

      if (baseSkills.length === 0) return [];

      // 2. Lấy dữ liệu phân tích kỹ năng thực tế của người dùng từ DB
      const matchedSkillsList =
        (defaultMatch.radar_data as unknown as MatchedSkillDetail[]) || [];
      const gapReport =
        defaultMatch.gap_report as unknown as GapReportStructure;
      const partialSkills =
        (gapReport && gapReport.partially_matched_skills) || [];

      // 3. Map điểm số chi tiết của từng kĩ năng thuộc danh mục này (Ép kiểu inline để vượt qua ESLint strict)
      return baseSkills.map((bs) => {
        const skillId = bs.skill_id;
        let userScore = 0;

        const matchedItem = matchedSkillsList.find(
          (s) => (s as { skill_id: number }).skill_id === skillId,
        );
        const partialItem = partialSkills.find(
          (p) => (p as { skill_id: number }).skill_id === skillId,
        );

        if (matchedItem) {
          userScore = Math.round(
            ((matchedItem as { similarity: number }).similarity || 0) * 100,
          );
        } else if (partialItem) {
          userScore = Math.round(
            ((partialItem as { similarity: number }).similarity || 0) * 100,
          );
        }

        return {
          skill_name: bs.skill_name,
          user_score: userScore,
          market_score:
            Math.round(bs.market_weight * 100) > 0
              ? Math.round(bs.market_weight * 100)
              : 70,
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
      this.logger.log(
        `Fetching structural hierarchical skill breakdown for user: ${userId}`,
      );
      const match = await this.getDefaultMatchOrThrow(userId);

      // 1. Lấy toàn bộ danh sách kỹ năng chuẩn của bài toán từ DB (Không phân biệt category đơn lẻ)
      let baseSkills: Array<{
        skill_id: number;
        skill_name: string;
        category: string;
        market_weight: number;
      }> = [];

      if (match.match_type === 'cv_job' && match.job_id) {
        const jobSkills = await this.prisma.jobSkill.findMany({
          where: { job_id: match.job_id },
          include: { skill: true },
        });
        baseSkills = jobSkills.map((js) => ({
          skill_id: js.skill_id,
          skill_name: js.skill.skill_name,
          category: js.skill.category || 'General',
          market_weight: 1.0,
        }));
      } else if (match.search_group) {
        const groupWeights = await this.prisma.jobGroupSkillWeight.findMany({
          where: { search_group: match.search_group },
          include: { skill: true },
        });
        baseSkills = groupWeights.map((gw) => ({
          skill_id: gw.skill_id,
          skill_name: gw.skill.skill_name,
          category: gw.skill.category || 'General',
          market_weight: Number(gw.weight_wi),
        }));
      }

      if (baseSkills.length === 0) return [];

      // 2. Lấy dữ liệu phân tích thực tế từ Match Report
      const matchedSkillsList =
        (match.radar_data as unknown as SkillDetail[]) || [];
      const gapReport = match.gap_report as unknown as GapReportStructure;
      const partialSkills =
        (gapReport && gapReport.partially_matched_skills) || [];
      const missingSkills = (gapReport && gapReport.missing_skills) || [];

      // Dùng Map nhóm các kỹ năng con theo tên Category cha
      const breakdownMap = new Map<
        string,
        {
          totalUserRate: number;
          totalMarketRate: number;
          totalGapScore: number;
          skillItems: SkillBreakdownItemDto[];
        }
      >();

      baseSkills.forEach((bs) => {
        const catName = bs.category;
        const skillId = bs.skill_id;

        let marketRate = Math.round(bs.market_weight * 100);
        if (marketRate === 0) marketRate = 75; // Đặt mốc mặc định giống hiển thị hình ảnh UI mẫu (75%)

        let userRate = 0;
        let status: 'Proficient' | 'Missing' = 'Missing';

        const matchedItem = matchedSkillsList.find(
          (s) => (s as { skill_id: number }).skill_id === skillId,
        );
        const partialItem = partialSkills.find(
          (p) => (p as { skill_id: number }).skill_id === skillId,
        );
        const isMissing = missingSkills.some(
          (m) => (m as { skill_id: number }).skill_id === skillId,
        );

        if (matchedItem) {
          userRate = Math.round(
            ((matchedItem as { similarity: number }).similarity || 0) * 100,
          );
          status = userRate >= marketRate ? 'Proficient' : 'Missing';
        } else if (partialItem) {
          userRate = Math.round(
            ((partialItem as { similarity: number }).similarity || 0) * 100,
          );
          status = userRate >= marketRate ? 'Proficient' : 'Missing';
        } else if (isMissing) {
          userRate = 0;
          status = 'Missing';
        } else {
          // Trường hợp kỹ năng đã khớp hoàn toàn (đầy đủ điểm)
          userRate = marketRate;
          status = 'Proficient';
        }

        const skillGap = userRate - marketRate;

        if (!breakdownMap.has(catName)) {
          breakdownMap.set(catName, {
            totalUserRate: 0,
            totalMarketRate: 0,
            totalGapScore: 0,
            skillItems: [],
          });
        }

        const group = breakdownMap.get(catName)!;
        group.totalUserRate += userRate;
        group.totalMarketRate += marketRate;
        group.totalGapScore += skillGap;
        group.skillItems.push({
          skill_id: skillId,
          skill_name: bs.skill_name,
          user_rate: userRate,
          market_rate: marketRate,
          status,
        });
      });

      // 3. Đóng gói Map thành mảng DTO phân cấp cấu trúc
      return Array.from(breakdownMap.entries()).map(([categoryName, data]) => {
        const count = data.skillItems.length;
        const avgUser = Math.round(data.totalUserRate / count);
        const avgMarket = Math.round(data.totalMarketRate / count);
        const totalGap = Math.round(data.totalGapScore / count); // Tính điểm gap trung bình của nhóm danh mục

        // Định dạng nhãn text hiển thị đúng như thiết kế UI (+ hoặc -)
        const gapLabel =
          totalGap >= 0 ? `+${totalGap}pt gap` : `${totalGap}pt gap`;

        return {
          category_name: categoryName,
          gap_label: gapLabel,
          user_rate_avg: avgUser,
          market_rate_avg: avgMarket,
          skills: data.skillItems,
        };
      });
    } catch (error: unknown) {
      this.handleError(error, 'Get Skills Breakdown Data');
      throw new BadRequestException(
        'Could not fetch skills breakdown table data',
      );
    }
  }

  private calculatePriority(
    weight: number,
  ): 'Core' | 'Priority' | 'Supporting' {
    const percentage = weight * 100;
    if (percentage > 50) return 'Core';
    if (percentage >= 20) return 'Priority';
    return 'Supporting';
  }

  private handleError(error: unknown, context: string) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const stack = error instanceof Error ? error.stack : '';
    this.logger.error(`SkillGapService ${context} failed: ${message}`, stack);
  }
}

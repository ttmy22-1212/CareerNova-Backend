import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  SkillGapScoreCardDto,
  SkillGapMissingPercentCardDto,
  SkillGapRadarPointDto,
  SkillGapCategoryBreakdownDto,
  SkillGapDetailLineDto,
} from './dto/skill-gap.dto';

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
export class SkillGapService {
  private readonly logger = new Logger(SkillGapService.name);

  constructor(private readonly prisma: PrismaService) {}

  // COMPONENT 1: Card độ khớp CV tổng quan
  async getMatchScoreCard(userId: string): Promise<SkillGapScoreCardDto> {
    try {
      this.logger.log(
        `Fetching skill gap match score card for user: ${userId}`,
      );
      const user = await this.prisma.user.findUnique({
        where: { user_id: userId },
        select: { default_match_id: true },
      });

      if (!user || !user.default_match_id) {
        throw new BadRequestException('Vui lòng thực hiện so khớp CV trước');
      }

      const match = await this.prisma.cvJobMatch.findUnique({
        where: { match_id: user.default_match_id },
        select: { match_score: true },
      });

      const rawScore = Number(match?.match_score || 0);
      return {
        match_score:
          rawScore <= 1 ? Math.round(rawScore * 100) : Math.round(rawScore),
      };
    } catch (error: unknown) {
      this.handleError(error, 'Match Score Card');
      throw new BadRequestException('Could not fetch match score card');
    }
  }

  // COMPONENT 2: Card phần trăm kĩ năng còn thiếu (Số skill thiếu / Tổng số kĩ năng cấu hình)
  async getMissingPercentCard(
    userId: string,
  ): Promise<SkillGapMissingPercentCardDto> {
    try {
      this.logger.log(
        `Fetching missing skills percentage card for user: ${userId}`,
      );
      const user = await this.prisma.user.findUnique({
        where: { user_id: userId },
        select: { default_match_id: true },
      });

      if (!user || !user.default_match_id) {
        return { missing_percentage: 0 };
      }

      const match = await this.prisma.cvJobMatch.findUnique({
        where: { match_id: user.default_match_id },
        select: { gap_report: true, search_group: true },
      });

      if (!match || !match.search_group) {
        return { missing_percentage: 0 };
      }

      // Đếm tổng số lượng kĩ năng bắt buộc của search_group này trong DB làm mẫu số
      const totalGroupSkillsCount = await this.prisma.jobGroupSkillWeight.count(
        {
          where: { search_group: match.search_group },
        },
      );

      if (totalGroupSkillsCount === 0) {
        return { missing_percentage: 0 };
      }

      const gapReport = match.gap_report as unknown as GapReportStructure;
      let missingCount = 0;
      if (gapReport && Array.isArray(gapReport.missing_skills)) {
        missingCount = gapReport.missing_skills.length;
      }

      // Tính toán tỉ lệ % làm tròn theo đặc tả yêu cầu
      const missingPercentage = Math.round(
        (missingCount / totalGroupSkillsCount) * 100,
      );

      return { missing_percentage: missingPercentage };
    } catch (error: unknown) {
      this.handleError(error, 'Missing Percent Card');
      return { missing_percentage: 0 };
    }
  }

  // COMPONENT 3: Biểu đồ Radar kĩ năng chi tiết (Cố định 6 kĩ năng)
  async getSkillsRadarData(userId: string): Promise<SkillGapRadarPointDto[]> {
    try {
      this.logger.log(
        `Fetching skill gap radar chart data for user: ${userId}`,
      );
      const user = await this.prisma.user.findUnique({
        where: { user_id: userId },
        select: { default_match_id: true },
      });

      if (!user || !user.default_match_id) {
        return [];
      }

      const match = await this.prisma.cvJobMatch.findUnique({
        where: { match_id: user.default_match_id },
        select: { radar_data: true, gap_report: true, search_group: true },
      });

      if (!match || !match.search_group) {
        return [];
      }

      const groupWeights = await this.prisma.jobGroupSkillWeight.findMany({
        where: { search_group: match.search_group },
        include: { skill: true },
        take: 6,
      });

      const matchedSkillsList =
        (match.radar_data as unknown as MatchedSkillDetail[]) || [];
      const gapReport = match.gap_report as unknown as GapReportStructure;
      const partialSkills =
        (gapReport && gapReport.partially_matched_skills) || [];

      return groupWeights.map((w) => {
        const skillId = w.skill_id;
        const marketScore = Math.round(Number(w.weight_wi) * 100);
        let userScore = 0;

        const matchedItem = matchedSkillsList.find(
          (s) => s.skill_id === skillId,
        );
        const partialItem = partialSkills.find((p) => p.skill_id === skillId);

        if (matchedItem) {
          userScore = Math.round((matchedItem.similarity || 0) * 100);
        } else if (partialItem) {
          userScore = Math.round((partialItem.similarity || 0) * 100);
        }

        return {
          skill_name: w.skill.skill_name,
          user_score: userScore,
          market_score: marketScore > 0 ? marketScore : 70,
        };
      });
    } catch (error: unknown) {
      this.handleError(error, 'Skills Radar Data');
      return [];
    }
  }

  // COMPONENT 4: Bảng phân rã chi tiết đầu mục kĩ năng theo danh mục động
  async getDetailedBreakdownData(
    userId: string,
  ): Promise<SkillGapCategoryBreakdownDto[]> {
    try {
      this.logger.log(
        `Fetching skill gap dynamic table breakdown for user: ${userId}`,
      );
      const user = await this.prisma.user.findUnique({
        where: { user_id: userId },
        select: { default_match_id: true },
      });

      if (!user || !user.default_match_id) {
        return [];
      }

      const match = await this.prisma.cvJobMatch.findUnique({
        where: { match_id: user.default_match_id },
        select: { gap_report: true, radar_data: true, search_group: true },
      });

      if (!match || !match.search_group) {
        return [];
      }

      const groupWeights = await this.prisma.jobGroupSkillWeight.findMany({
        where: { search_group: match.search_group },
        include: { skill: true },
      });

      const matchedSkillsList =
        (match.radar_data as unknown as MatchedSkillDetail[]) || [];
      const gapReport = match.gap_report as unknown as GapReportStructure;
      const missingSkills = (gapReport && gapReport.missing_skills) || [];
      const partialSkills =
        (gapReport && gapReport.partially_matched_skills) || [];

      const breakdownMap = new Map<
        string,
        { maxWeight: number; list: SkillGapDetailLineDto[] }
      >();

      for (const w of groupWeights) {
        const category = w.skill.category || 'General';
        const weightNum = Number(w.weight_wi);

        const matchedItem = matchedSkillsList.find(
          (m) => m.skill_id === w.skill_id,
        );
        const missingItem = missingSkills.find(
          (m) => m.skill_id === w.skill_id,
        );
        const partialItem = partialSkills.find(
          (p) => p.skill_id === w.skill_id,
        );

        let status = 'Proficient';
        let userRate = 100;
        const marketRate = Math.round(weightNum * 100);

        if (matchedItem) {
          status = 'Proficient';
          userRate = Math.round((matchedItem.similarity || 0) * 100);
        } else if (partialItem) {
          status = 'Missing';
          userRate = Math.round((partialItem.similarity || 0) * 100);
        } else if (missingItem) {
          status = 'Missing';
          userRate = Math.round((missingItem.similarity || 0) * 100);
        }

        const currentGroup = breakdownMap.get(category) || {
          maxWeight: 0,
          list: [],
        };
        currentGroup.list.push({
          skill_name: w.skill.skill_name,
          status,
          market_rate: marketRate > 0 ? marketRate : 70,
          user_rate: userRate,
        });

        if (weightNum > currentGroup.maxWeight) {
          currentGroup.maxWeight = weightNum;
        }

        breakdownMap.set(category, currentGroup);
      }

      return Array.from(breakdownMap.entries()).map(([category, data]) => {
        let label = 'Bổ trợ';
        if (data.maxWeight >= 0.5) {
          label = 'Cốt lõi';
        } else if (data.maxWeight > 0.2) {
          label = 'Ưu tiên';
        }

        return {
          category,
          label,
          skills: data.list,
        };
      });
    } catch (error: unknown) {
      this.handleError(error, 'Detailed Breakdown Data');
      return [];
    }
  }

  private handleError(error: unknown, context: string) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const stack = error instanceof Error ? error.stack : '';
    this.logger.error(`SkillGap [${context}] failed: ${message}`, stack);
  }
}

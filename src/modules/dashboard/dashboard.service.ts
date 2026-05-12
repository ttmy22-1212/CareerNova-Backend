import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getMarketSummary(userId?: string) {
    try {
      this.logger.log(
        `Fetching market summary (User: ${userId || 'Guest'})...`,
      );

      // 1. Tính tổng Job
      const total_jobs = await this.prisma.job.count({
        where: {
          OR: [{ expiry_time: { gte: new Date() } }, { expiry_time: null }],
        },
      });
      this.logger.debug(`Found ${total_jobs} active jobs.`);

      // 2. Tính tổng công ty
      const total_companies = await this.prisma.company.count();

      // 3. Tính lương trung bình
      const salaryData = await this.prisma.salary.aggregate({
        _avg: { med_salary: true },
      });

      // 4. Top Skills
      const topSkillsRaw = await this.prisma.jobSkill.groupBy({
        by: ['skill_id'],
        _count: { job_id: true },
        orderBy: { _count: { job_id: 'desc' } },
        take: 5,
      });

      const top_skills = await Promise.all(
        topSkillsRaw.map(async (item) => {
          const skill = await this.prisma.skill.findUnique({
            where: { skill_id: item.skill_id },
          });
          return {
            skill_id: item.skill_id,
            skill_name: skill?.skill_name || 'Unknown',
            job_count: item._count.job_id,
            demand_percentage:
              total_jobs > 0
                ? Math.round((item._count.job_id / total_jobs) * 100)
                : 0,
          };
        }),
      );
      this.logger.debug(
        `Top skills calculated: ${top_skills.map((s) => s.skill_name).join(', ')}`,
      );

      // 5. Top Industries
      const top_industries = await this.prisma.industry.findMany({
        take: 5,
        select: {
          industry_id: true,
          industry_name: true,
          _count: {
            select: { company_industries: true },
          },
        },
      });

      if (userId) {
        const personal_market_insight =
          await this.getPersonalInsightData(userId);
        this.logger.log(`Market summary compiled successfully.`);
        return {
          total_jobs,
          total_companies,
          avg_salary: Math.round(Number(salaryData._avg.med_salary || 0)),
          top_skills,
          top_industries: top_industries.map((i) => ({
            industry_id: i.industry_id,
            industry_name: i.industry_name,
            job_count: i._count.company_industries,
          })),
          personal_market_insight,
        };
      }

      this.logger.log(`Market summary compiled successfully.`);
      return {
        total_jobs,
        total_companies,
        avg_salary: Math.round(Number(salaryData._avg.med_salary || 0)),
        top_skills,
        top_industries: top_industries.map((i) => ({
          industry_id: i.industry_id,
          industry_name: i.industry_name,
          job_count: i._count.company_industries,
        })),
      };
    } catch (error) {
      this.logger.error(
        `Failed to get market summary: ${error as Error}.message}`,
        (error as Error).stack,
      );
      throw error;
    }
  }

  async getPersonalDashboard(userId: string, cv_id?: string) {
    try {
      this.logger.log(`Generating personal dashboard for user: ${userId}`);

      const activeCv = await this.prisma.userCv.findFirst({
        where: cv_id ? { cv_id, user_id: userId } : { user_id: userId },
        orderBy: { uploaded_at: 'desc' },
      });

      if (!activeCv) {
        this.logger.warn(
          `No active CV found for user: ${userId}. Returning default dashboard.`,
        );
        return this.getDefaultPersonalDashboard();
      }

      this.logger.debug(`Active CV identified: ${activeCv.cv_id}`);

      const matches = await this.prisma.cvJobMatch.findMany({
        where: { cv_id: activeCv.cv_id },
        select: { match_score: true },
      });

      const avg_match_score = matches.length
        ? matches.reduce((acc, curr) => acc + Number(curr.match_score), 0) /
          matches.length
        : 0;

      const strengthData = await this.calculateProfileStrength(
        userId,
        activeCv.cv_id,
      );

      this.logger.log(
        `Personal dashboard for ${userId} ready (Match Score: ${avg_match_score.toFixed(2)}).`,
      );
      return {
        avg_match_score: Math.round(avg_match_score),
        matched_jobs_count: matches.length,
        critical_skill_gaps: [],
        top_recommended_jobs: [],
        profile_strength: strengthData.score,
        profile_checklist: strengthData.checklist,
        journey_stages: [],
      };
    } catch (error) {
      this.logger.error(
        `Failed to get personal dashboard for user ${userId}: ${error as Error}.message}`,
      );
      return this.getDefaultPersonalDashboard();
    }
  }

  private async calculateProfileStrength(userId: string, cvId: string) {
    this.logger.debug(`Calculating profile strength for CV: ${cvId}`);
    let score = 0;
    const checklist: { id: string; done: boolean; weight: number }[] = [];

    const hasCv = !!cvId;
    if (hasCv) score += 25;
    checklist.push({ id: 'cv', done: hasCv, weight: 25 });

    const skillCount = await this.prisma.userCvSkill.count({
      where: { cv_id: cvId },
    });
    const hasEnoughSkills = skillCount >= 5;
    if (hasEnoughSkills) score += 20;
    checklist.push({ id: 'skills', done: hasEnoughSkills, weight: 20 });

    checklist.push({ id: 'major', done: false, weight: 15 });
    checklist.push({ id: 'goal', done: false, weight: 15 });

    this.logger.debug(`Profile strength score: ${score}`);
    return { score, checklist };
  }

  private async getPersonalInsightData(userId: string) {
    this.logger.debug(`Fetching insight data for user: ${userId}`);
    const activeCv = await this.prisma.userCv.findFirst({
      where: { user_id: userId },
      orderBy: { uploaded_at: 'desc' },
    });

    if (!activeCv) return null;

    const highMatch = await this.prisma.cvJobMatch.count({
      where: { cv_id: activeCv.cv_id, match_score: { gte: 75 } },
    });

    const strength = await this.calculateProfileStrength(
      userId,
      activeCv.cv_id,
    );

    return {
      high_match_count: highMatch,
      missing_skills_count: 0,
      top_missing_skill: 'N/A',
      profile_strength: strength.score,
    };
  }

  private getDefaultPersonalDashboard() {
    return {
      avg_match_score: 0,
      matched_jobs_count: 0,
      critical_skill_gaps: [],
      top_recommended_jobs: [],
      profile_strength: 0,
      profile_checklist: [
        { id: 'cv', done: false, weight: 25 },
        { id: 'skills', done: false, weight: 20 },
      ],
      journey_stages: [],
    };
  }
}

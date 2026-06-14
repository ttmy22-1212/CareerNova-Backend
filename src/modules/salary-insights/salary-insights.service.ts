import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import {
  SalarySummaryDto,
  SalaryByRoleDto,
  SalaryByLocationDto,
  SalaryBySkillDto,
  SalaryFilterDto,
  SalaryTrendDto,
} from './dto/salary-insights.dto';
import {
  getNormalizedSalaryRange,
  getSalaryRepresentativeAnnualUsd,
  summarizeNormalizedSalaries,
} from '../../common/utils/salary.util';

@Injectable()
export class SalaryInsightsService {
  private readonly logger = new Logger(SalaryInsightsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getSummary(filters: SalaryFilterDto): Promise<SalarySummaryDto> {
    try {
      this.logger.log(
        `Fetching salary summary with filters: ${JSON.stringify(filters)}`,
      );
      const jobWhereInput = this.buildWhereCondition(filters);

      const now = new Date();
      const currentYear = now.getFullYear(); // 2026

      const salaryRecords = await this.prisma.salary.findMany({
        where: { job: jobWhereInput },
        select: {
          min_salary: true,
          max_salary: true,
          med_salary: true,
          currency: true,
          pay_period: true,
          job: {
            select: { listed_time: true },
          },
        },
      });
      const salarySummary = summarizeNormalizedSalaries(salaryRecords);

      const openJobsCount = await this.prisma.job.count({
        where: {
          ...jobWhereInput,
          OR: [{ expiry_time: { gte: now } }, { expiry_time: null }],
        },
      });

      const currentYearSummary = summarizeNormalizedSalaries(
        salaryRecords.filter(
          (record) => record.job?.listed_time?.getFullYear() === currentYear,
        ),
      );
      const lastYearSummary = summarizeNormalizedSalaries(
        salaryRecords.filter(
          (record) =>
            record.job?.listed_time?.getFullYear() === currentYear - 1,
        ),
      );
      const thisYearAvg =
        currentYearSummary.count > 0
          ? currentYearSummary.average
          : salarySummary.average;
      const lastYearAvg = lastYearSummary.average;

      let growthPercentage = 0;
      if (lastYearAvg > 0) {
        growthPercentage = ((thisYearAvg - lastYearAvg) / lastYearAvg) * 100;
      } else {
        growthPercentage = 0;
      }

      const result = {
        average_salary: Math.round(salarySummary.average),
        median_salary: Math.round(salarySummary.median),
        percentile_75: Math.round(salarySummary.percentile75),
        open_jobs_count: openJobsCount,
        salary_growth_percentage: Number(growthPercentage.toFixed(1)),
      };

      this.logger.log(`Summary fetched successfully with growth profile.`);
      return result;
    } catch (error: unknown) {
      this.handleError(error, 'Summary');
      throw new BadRequestException('Could not get salary summary');
    }
  }

  async getByRole(filters: SalaryFilterDto): Promise<SalaryByRoleDto[]> {
    try {
      this.logger.log(
        `Fetching salary by role with filters: ${JSON.stringify(filters)}`,
      );
      const jobWhereInput = this.buildWhereCondition(filters);

      // job_category
      const categories = await this.prisma.job.groupBy({
        by: ['job_category'],
        _count: { job_id: true },
        where: {
          ...jobWhereInput,
          AND: [{ job_category: { not: null } }, { job_category: { not: '' } }],
        },
        orderBy: { _count: { job_id: 'desc' } },
        take: 6, // top 6
      });

      const results = await Promise.all(
        categories.map(async (c) => {
          const salaries = await this.prisma.salary.findMany({
            where: { job: { ...jobWhereInput, job_category: c.job_category } },
            select: {
              min_salary: true,
              max_salary: true,
              med_salary: true,
              currency: true,
              pay_period: true,
            },
          });
          const normalizedRanges = salaries
            .map(getNormalizedSalaryRange)
            .filter((range): range is NonNullable<typeof range> => !!range);
          const summary = summarizeNormalizedSalaries(salaries);

          if (normalizedRanges.length === 0) return null;

          return {
            role: c.job_category || 'N/A',
            min_salary: Math.round(
              Math.min(...normalizedRanges.map((range) => range.min)),
            ),
            avg_salary: Math.round(summary.average),
            max_salary: Math.round(
              Math.max(...normalizedRanges.map((range) => range.max)),
            ),
            sample_count: summary.count,
          };
        }),
      );

      return results.filter((item): item is SalaryByRoleDto => item !== null);
    } catch (error: unknown) {
      this.handleError(error, 'By Role');
      return [];
    }
  }

  // 2. HÀM LẤY LƯƠNG THEO NƠI LÀM VIỆC (Biểu đồ ngang) -> Trả về SalaryByLocationDto[]
  async getByLocation(
    filters: SalaryFilterDto,
  ): Promise<SalaryByLocationDto[]> {
    try {
      this.logger.log(
        `Fetching salary by location with filters: ${JSON.stringify(filters)}`,
      );
      const jobWhereInput = this.buildWhereCondition(filters);

      const locations = await this.prisma.job.groupBy({
        by: ['location'],
        _count: { job_id: true },
        where: {
          ...jobWhereInput,
          AND: [{ location: { not: null } }, { location: { not: '' } }],
        },
        orderBy: { _count: { job_id: 'desc' } },
        take: 10, // Lấy top 10 thành phố lương cao/nhiều job nhất
      });

      const results = await Promise.all(
        locations.map(async (l) => {
          const salaries = await this.prisma.salary.findMany({
            where: { job: { ...jobWhereInput, location: l.location } },
            select: {
              min_salary: true,
              max_salary: true,
              med_salary: true,
              currency: true,
              pay_period: true,
            },
          });
          const summary = summarizeNormalizedSalaries(salaries);
          if (summary.count === 0) return null;

          return {
            location: l.location || 'N/A',
            avg_salary: Math.round(summary.average),
            job_count: l._count.job_id,
          };
        }),
      );

      return results.filter(
        (item): item is SalaryByLocationDto => item !== null,
      );
    } catch (error: unknown) {
      this.handleError(error, 'By Location');
      return [];
    }
  }

  // 3. HÀM LẤY LƯƠNG THEO KỸ NĂNG (Biểu đồ hái ra tiền) -> Trả về SalaryBySkillDto[]
  async getBySkill(filters: SalaryFilterDto): Promise<SalaryBySkillDto[]> {
    try {
      this.logger.log(
        `Fetching salary by skill with filters: ${JSON.stringify(filters)}`,
      );
      const jobWhereInput = this.buildWhereCondition(filters);

      // Tìm kiếm các skill xuất hiện nhiều nhất trong các Job đã lọc ứng với điều kiện UI
      const skillsStats = await this.prisma.jobSkill.groupBy({
        by: ['skill_id'],
        _count: { job_id: true },
        where: { job: jobWhereInput },
        orderBy: { _count: { job_id: 'desc' } },
        take: 6,
      });

      const results = await Promise.all(
        skillsStats.map(async (s) => {
          const skillInfo = await this.prisma.skill.findUnique({
            where: { skill_id: s.skill_id },
          });

          const salaries = await this.prisma.salary.findMany({
            where: {
              job: {
                ...jobWhereInput,
                job_skills: { some: { skill_id: s.skill_id } },
              },
            },
            select: {
              min_salary: true,
              max_salary: true,
              med_salary: true,
              currency: true,
              pay_period: true,
            },
          });
          const summary = summarizeNormalizedSalaries(salaries);
          if (summary.count === 0) return null;

          return {
            skill_id: s.skill_id,
            skill_name: skillInfo?.skill_name || 'Unknown',
            avg_salary: Math.round(summary.average),
            job_count: s._count.job_id,
          };
        }),
      );

      return results.filter((item): item is SalaryBySkillDto => item !== null);
    } catch (error: unknown) {
      this.handleError(error, 'By Skill');
      return [];
    }
  }

  async getTrend(filters: SalaryFilterDto): Promise<SalaryTrendDto[]> {
    try {
      this.logger.log(
        `Fetching salary trend with filters: ${JSON.stringify(filters)}`,
      );
      const jobWhereInput = this.buildWhereCondition(filters);

      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

      const salaryRecords = await this.prisma.salary.findMany({
        where: {
          OR: [
            { min_salary: { not: null } },
            { max_salary: { not: null } },
            { med_salary: { not: null } },
          ],
          job: {
            ...jobWhereInput,
            listed_time: { gte: sixMonthsAgo },
            AND: [
              { formatted_experience_level: { not: null } },
              { formatted_experience_level: { not: '' } },
            ],
          },
        },
        select: {
          min_salary: true,
          max_salary: true,
          med_salary: true,
          currency: true,
          pay_period: true,
          job: {
            select: {
              listed_time: true,
              formatted_experience_level: true,
            },
          },
        },
      });

      const groupMap = new Map<
        string,
        { totalSalary: number; count: number; monthStr: string; level: string }
      >();
      const monthNames = [
        'Jan',
        'Feb',
        'Mar',
        'Apr',
        'May',
        'Jun',
        'Jul',
        'Aug',
        'Sep',
        'Oct',
        'Nov',
        'Dec',
      ];

      for (const record of salaryRecords) {
        if (!record.job?.listed_time || !record.job?.formatted_experience_level)
          continue;
        const normalizedSalary = getSalaryRepresentativeAnnualUsd(record);
        if (normalizedSalary === null) continue;

        const date = new Date(record.job.listed_time);
        const monthStr = monthNames[date.getMonth()];
        const level = record.job.formatted_experience_level;
        const key = `${monthStr}_${level}`;

        const current = groupMap.get(key) || {
          totalSalary: 0,
          count: 0,
          monthStr,
          level,
        };
        current.totalSalary += normalizedSalary;
        current.count += 1;
        groupMap.set(key, current);
      }

      const trendResults = Array.from(groupMap.values()).map((g) => ({
        month: g.monthStr,
        level: g.level,
        avg_salary: Math.round(g.totalSalary / g.count),
      }));

      const monthOrder = {};
      for (let i = 0; i < 6; i++) {
        const d = new Date();
        d.setMonth(d.getMonth() - i);
        monthOrder[monthNames[d.getMonth()]] = 5 - i;
      }

      return trendResults.sort(
        (a, b) => (monthOrder[a.month] || 0) - (monthOrder[b.month] || 0),
      );
    } catch (error: unknown) {
      this.handleError(error, 'Trend 6 Months');
      return [];
    }
  }

  private buildWhereCondition(filters: SalaryFilterDto): Prisma.JobWhereInput {
    const condition: Prisma.JobWhereInput = {};

    if (filters.role) {
      condition.job_category = filters.role;
    }
    if (filters.location) {
      condition.location = filters.location;
    }
    if (filters.level) {
      condition.formatted_experience_level = filters.level;
    }
    if (filters.skill_id) {
      condition.job_skills = {
        some: { skill_id: Number(filters.skill_id) },
      };
    }

    return condition;
  }

  private handleError(error: unknown, context: string) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const stack = error instanceof Error ? error.stack : '';
    this.logger.error(`Salary ${context} failed: ${message}`, stack);
  }
}

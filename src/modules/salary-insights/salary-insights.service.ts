import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import {
  SalarySummaryDto,
  SalaryByRoleDto,
  SalaryByLocationDto,
  SalaryBySkillDto,
} from './dto/salary-insights.dto';

interface GroupByResult {
  title?: string;
  location?: string;
  skill_id?: number;
  _count: { job_id: number };
}

@Injectable()
export class SalaryInsightsService {
  private readonly logger = new Logger(SalaryInsightsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getSummary(): Promise<SalarySummaryDto> {
    try {
      this.logger.log('Fetching salary summary...');
      const aggregate = await this.prisma.salary.aggregate({
        _avg: { med_salary: true },
      });

      const openJobsCount = await this.prisma.job.count({
        where: {
          OR: [{ expiry_time: { gte: new Date() } }, { expiry_time: null }],
        },
      });

      const allSalaries = await this.prisma.salary.findMany({
        select: { med_salary: true },
        orderBy: { med_salary: 'asc' },
      });

      const salaries = allSalaries.map((s) => Number(s.med_salary || 0));
      const result = {
        average_salary: Math.round(Number(aggregate._avg?.med_salary || 0)),
        median_salary: this.calculatePercentile(salaries, 0.5),
        percentile_75: this.calculatePercentile(salaries, 0.75),
        open_jobs_count: openJobsCount,
      };

      this.logger.log(
        `Summary fetched: avg=${result.average_salary}, jobs=${result.open_jobs_count}`,
      );
      return result;
    } catch (error: unknown) {
      this.handleError(error, 'Summary');
      throw new BadRequestException('Could not get salary summary');
    }
  }

  async getByRole(): Promise<SalaryByRoleDto[]> {
    try {
      this.logger.log('Fetching salary by role...');
      const roles = (await this.prisma.job.groupBy({
        by: ['title'] as Prisma.JobScalarFieldEnum[],
        _count: { job_id: true },
        where: { title: { not: '' } },
      })) as unknown as GroupByResult[];

      this.logger.log(`Found ${roles.length} roles to process`);

      const results = await Promise.all(
        roles.map(async (r) => {
          const stats = await this.prisma.salary.aggregate({
            where: { job: { title: r.title } },
            _min: { min_salary: true },
            _max: { max_salary: true },
            _avg: { med_salary: true },
          });

          return {
            role: r.title || 'N/A',
            min_salary: Number(stats._min?.min_salary || 0),
            avg_salary: Math.round(Number(stats._avg?.med_salary || 0)),
            max_salary: Number(stats._max?.max_salary || 0),
            sample_count: r._count.job_id,
          };
        }),
      );

      this.logger.log(`Successfully processed ${results.length} roles`);
      return results;
    } catch (error: unknown) {
      this.handleError(error, 'By Role');
      return [];
    }
  }

  async getByLocation(): Promise<SalaryByLocationDto[]> {
    try {
      this.logger.log('Fetching salary by location...');
      const locations = (await this.prisma.job.groupBy({
        by: ['location'] as Prisma.JobScalarFieldEnum[],
        _count: { job_id: true },
        where: { location: { not: null } },
      })) as unknown as GroupByResult[];

      this.logger.log(`Found ${locations.length} locations to process`);

      const results = await Promise.all(
        locations.map(async (l) => {
          const stats = await this.prisma.salary.aggregate({
            where: { job: { location: l.location } },
            _avg: { med_salary: true },
          });

          return {
            location: l.location || 'N/A',
            avg_salary: Math.round(Number(stats._avg?.med_salary || 0)),
            job_count: l._count.job_id,
          };
        }),
      );

      this.logger.log(`Successfully processed ${results.length} locations`);
      return results;
    } catch (error: unknown) {
      this.handleError(error, 'By Location');
      return [];
    }
  }

  async getBySkill(): Promise<SalaryBySkillDto[]> {
    try {
      this.logger.log('Fetching salary by skill...');
      const skillsStats = (await this.prisma.jobSkill.groupBy({
        by: ['skill_id'] as Prisma.JobSkillScalarFieldEnum[],
        _count: { job_id: true },
      })) as unknown as GroupByResult[];

      this.logger.log(`Found ${skillsStats.length} skills to process`);

      const results = await Promise.all(
        skillsStats.map(async (s) => {
          const skillInfo = await this.prisma.skill.findUnique({
            where: { skill_id: s.skill_id },
          });

          const salaryStats = await this.prisma.salary.aggregate({
            where: { job: { job_skills: { some: { skill_id: s.skill_id } } } },
            _avg: { med_salary: true },
          });

          return {
            skill_id: s.skill_id || 0,
            skill_name: skillInfo?.skill_name || 'Unknown',
            avg_salary: Math.round(Number(salaryStats._avg?.med_salary || 0)),
            job_count: s._count.job_id,
          };
        }),
      );

      this.logger.log(`Successfully processed ${results.length} skills`);
      return results;
    } catch (error: unknown) {
      this.handleError(error, 'By Skill');
      return [];
    }
  }

  private calculatePercentile(data: number[], percentile: number): number {
    if (data.length === 0) return 0;
    const index = Math.floor(percentile * (data.length - 1));
    const value = data[index];
    this.logger.debug(
      `Calculated percentile ${percentile}: ${value} (index ${index})`,
    );
    return value;
  }

  private handleError(error: unknown, context: string) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const stack = error instanceof Error ? error.stack : '';
    this.logger.error(`Salary ${context} failed: ${message}`, stack);
  }
}

import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { GetJobsQueryDto, SortOrder } from './dto/get-jobs-query.dto';
import { GetJobsResponseDto, JobItemDto } from './dto/job-response.dto';
import { GetSkillsQueryDto } from './dto/get-skills-query.dto';
import { GetSkillsResponseDto } from './dto/skill-response.dto';

@Injectable()
export class JobService {
  private readonly logger = new Logger(JobService.name);

  constructor(private prisma: PrismaService) {}

  async findAll(
    userId: string,
    query: GetJobsQueryDto,
  ): Promise<GetJobsResponseDto> {
    const {
      page = 1,
      limit = 20,
      q,
      work_type,
      location,
      experience_level,
      cv_id,
      min_match,
      sortBy = 'listed_time',
      sortOrder = SortOrder.DESC,
    } = query;

    const skip = (Math.max(1, page) - 1) * limit;

    const andConditions: Prisma.JobWhereInput[] = [
      q
        ? {
            OR: [
              { title: { contains: q, mode: 'insensitive' } },
              { skills_desc: { contains: q, mode: 'insensitive' } },
              { company: { name: { contains: q, mode: 'insensitive' } } },
            ],
          }
        : {},
      work_type ? { work_type } : {},
      location ? { location: { contains: location, mode: 'insensitive' } } : {},
      experience_level ? { formatted_experience_level: experience_level } : {},
    ];

    if (sortBy === 'match_score' && cv_id) {
      andConditions.push({
        cv_matches: {
          some: {
            cv_id: cv_id,
            match_score: { not: null },
          },
        },
      });
    }

    const where: Prisma.JobWhereInput = {
      AND: andConditions,
    };

    if (sortBy !== 'match_score' && cv_id && min_match !== undefined) {
      where.cv_matches = {
        some: {
          cv_id,
          match_score: { gte: min_match },
        },
      };
    }

    // Aggregate for Salary
    let orderBy: any;

    if (sortBy === 'salary_med' || sortBy === 'match_score') {
      orderBy = undefined;
    } else {
      orderBy = { [sortBy]: sortOrder };
    }

    this.logger.log(
      `Fetching jobs: page=${page}, limit=${limit}, sortBy=${sortBy}`,
    );

    const [total, jobs] = await Promise.all([
      this.prisma.job.count({ where }),
      this.prisma.job.findMany({
        where,
        skip,
        take: limit,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        orderBy,
        include: {
          company: { select: { company_id: true, name: true } },
          salaries: {
            orderBy: { med_salary: 'desc' },
            take: 1,
          },
          job_skills: {
            include: {
              skill: { select: { skill_id: true, skill_name: true } },
            },
          },
          cv_matches: cv_id
            ? {
                where: { cv_id },
                orderBy: { created_at: 'desc' },
                take: 1,
              }
            : false,
          saved_by: {
            where: { user_id: userId },
            select: { saved_job_id: true },
            take: 1,
          },
        },
      }),
    ]);

    // map Data to JobItemDto
    const formattedData: JobItemDto[] = jobs.map((job) => {
      const matchRecord = job.cv_matches?.[0];
      const salary = job.salaries[0] || null;
      const is_saved = job.saved_by && job.saved_by.length > 0;

      return {
        job_id: job.job_id.toString(),
        title: job.title,
        company: {
          company_id: job.company?.company_id.toString() || '',
          name: job.company?.name || 'Unknown',
        },
        location: job.location,
        work_type: job.work_type,
        formatted_experience_level: job.formatted_experience_level,
        listed_time: job.listed_time!,
        salary: salary
          ? {
              min_salary: salary.min_salary?.toString() || null,
              max_salary: salary.max_salary?.toString() || null,
              med_salary: salary.med_salary?.toString() || null,
              currency: salary.currency!,
              pay_period: salary.pay_period,
            }
          : null,
        skills: job.job_skills.map((js) => ({
          skill_id: js.skill_id,
          skill_name: js.skill.skill_name,
          is_inferred: js.is_inferred || false,
        })),
        match_score: matchRecord ? Number(matchRecord.match_score) : null,
        is_saved: is_saved,
      };
    });

    // Sort by match_score (Application)
    if (sortBy === 'match_score' && cv_id) {
      formattedData.sort((a, b) =>
        sortOrder === SortOrder.DESC
          ? (b.match_score || 0) - (a.match_score || 0)
          : (a.match_score || 0) - (b.match_score || 0),
      );
    }

    if (sortBy === 'salary_med') {
      formattedData.sort((a, b) => {
        const salaryA = a.salary?.med_salary ? Number(a.salary.med_salary) : 0;
        const salaryB = b.salary?.med_salary ? Number(b.salary.med_salary) : 0;

        return sortOrder === SortOrder.DESC
          ? salaryB - salaryA
          : salaryA - salaryB;
      });
    }

    return {
      data: formattedData,
      meta: {
        page: Number(page),
        limit: Number(limit),
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(userId: string, jobId: string, cvId?: string) {
    this.logger.log(`Fetching job details for ID: ${jobId}, CV ID: ${cvId}`);

    const job = await this.prisma.job.findUnique({
      where: { job_id: BigInt(jobId) },
      include: {
        company: {
          include: {
            company_industries: {
              include: { industry: true },
            },
          },
        },
        salaries: true,
        job_skills: {
          include: { skill: true },
        },
        job_benefits: {
          include: { benefit: true },
        },
        cv_matches: cvId
          ? {
              where: { cv_id: cvId },
              orderBy: { created_at: 'desc' },
              take: 1,
            }
          : false,
        saved_by: {
          where: { user_id: userId },
          select: { saved_job_id: true },
          take: 1,
        },
      },
    });

    if (!job) {
      this.logger.warn(`Job not found: ${jobId}`);
      throw new NotFoundException('RESOURCE_NOT_FOUND');
    }

    const industries =
      job.company?.company_industries.map((ci) => ci.industry) || [];
    const matchRecord = job.cv_matches?.[0];
    const match_breakdown = matchRecord?.gap_report || {
      strong: [],
      partial: [],
      missing: [],
    };
    const is_saved = job.saved_by && job.saved_by.length > 0;
    return {
      data: {
        job: {
          ...job,
          job_id: job.job_id.toString(),
          company_id: job.company_id?.toString(),
          company: undefined,
          salaries: undefined,
          job_skills: undefined,
          job_benefits: undefined,
          cv_matches: undefined,
        },
        company: job.company
          ? {
              ...job.company,
              company_id: job.company.company_id.toString(),
              company_industries: undefined,
            }
          : null,
        salary: job.salaries[0]
          ? {
              ...job.salaries[0],
              job_id: undefined,
              min_salary: job.salaries[0].min_salary?.toString(),
              max_salary: job.salaries[0].max_salary?.toString(),
              med_salary: job.salaries[0].med_salary?.toString(),
            }
          : null,
        skills: job.job_skills.map((js) => ({
          skill_id: js.skill_id,
          skill_name: js.skill.skill_name,
          is_inferred: js.is_inferred,
        })),
        benefits: job.job_benefits.map((jb) => ({
          benefit_id: jb.benefit_id,
          benefit_name: jb.benefit.benefit_name,
          is_inferred: jb.is_inferred,
        })),
        industries: industries,
        match_breakdown: match_breakdown,
        is_saved: is_saved,
      },
    };
  }

  async getSkills(query: GetSkillsQueryDto): Promise<GetSkillsResponseDto> {
    const { q } = query;
    this.logger.log(
      `Fetching skills master list with query: search="${q || ''}"`,
    );

    const skills = await this.prisma.skill.findMany({
      where: q
        ? {
            skill_name: {
              contains: q,
              mode: 'insensitive',
            },
          }
        : {},
      take: 30,
      orderBy: {
        skill_name: 'asc',
      },
      select: {
        skill_id: true,
        skill_name: true,
      },
    });

    return {
      data: skills,
    };
  }
}

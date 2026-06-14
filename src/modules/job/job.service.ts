import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { GetJobsQueryDto, SortOrder } from './dto/get-jobs-query.dto';
import { GetJobsResponseDto, JobItemDto } from './dto/job-response.dto';
import { GetSkillsQueryDto } from './dto/get-skills-query.dto';
import { GetSkillsResponseDto } from './dto/skill-response.dto';
import {
  getBestSalaryRecord,
  getSalaryRepresentativeAnnualUsd,
} from '../../common/utils/salary.util';

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

    const matchScoreFilter: Prisma.CvJobMatchWhereInput | null = cv_id
      ? this.buildMatchScoreFilter(cv_id, min_match)
      : null;

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
      work_type ? this.buildWorkTypeFilter(work_type) : {},
      location ? { location: { contains: location, mode: 'insensitive' } } : {},
      experience_level ? { formatted_experience_level: experience_level } : {},
    ];

    if (
      matchScoreFilter &&
      (sortBy === 'match_score' || min_match !== undefined)
    ) {
      andConditions.push({
        cv_matches: {
          some: matchScoreFilter,
        },
      });
    }

    const where: Prisma.JobWhereInput = {
      AND: andConditions,
    };

    const shouldSortBySalary = sortBy === 'salary_med';
    const shouldSortByMatchScore = sortBy === 'match_score' && !!cv_id;
    const shouldSortInMemory = shouldSortBySalary || shouldSortByMatchScore;
    const shouldSkipDbOrder = shouldSortBySalary || sortBy === 'match_score';
    const orderBy = shouldSkipDbOrder ? undefined : { [sortBy]: sortOrder };

    this.logger.log(
      `Fetching jobs: page=${page}, limit=${limit}, sortBy=${sortBy}`,
    );

    const [total, jobs] = await Promise.all([
      this.prisma.job.count({ where }),
      this.prisma.job.findMany({
        where,
        ...(shouldSortInMemory ? {} : { skip, take: limit }),
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        orderBy,
        include: {
          company: { select: { company_id: true, name: true } },
          salaries: {
            orderBy: { salary_id: 'asc' },
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

    const sortedJobs = [...jobs];

    if (shouldSortByMatchScore) {
      sortedJobs.sort((a, b) => {
        const scoreA = a.cv_matches?.[0]
          ? this.normalizeMatchScore(a.cv_matches[0].match_score)
          : null;
        const scoreB = b.cv_matches?.[0]
          ? this.normalizeMatchScore(b.cv_matches[0].match_score)
          : null;

        return this.compareNullableNumbers(scoreA, scoreB, sortOrder);
      });
    }

    if (shouldSortBySalary) {
      sortedJobs.sort((a, b) => {
        const salaryA = getSalaryRepresentativeAnnualUsd(
          getBestSalaryRecord(a.salaries),
        );
        const salaryB = getSalaryRepresentativeAnnualUsd(
          getBestSalaryRecord(b.salaries),
        );

        return this.compareNullableNumbers(salaryA, salaryB, sortOrder);
      });
    }

    const pageJobs = shouldSortInMemory
      ? sortedJobs.slice(skip, skip + limit)
      : sortedJobs;

    // map Data to JobItemDto
    const formattedData: JobItemDto[] = pageJobs.map((job) => {
      const matchRecord = job.cv_matches?.[0];
      const salary = getBestSalaryRecord(job.salaries);
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
        job_posting_url: job.job_posting_url,
        match_score: matchRecord
          ? this.normalizeMatchScore(matchRecord.match_score)
          : null,
        is_saved: is_saved,
      };
    });

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
    const selectedSalary = getBestSalaryRecord(job.salaries);
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
        salary: selectedSalary
          ? {
              ...selectedSalary,
              job_id: undefined,
              min_salary: selectedSalary.min_salary?.toString(),
              max_salary: selectedSalary.max_salary?.toString(),
              med_salary: selectedSalary.med_salary?.toString(),
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

  async getCategories(): Promise<string[]> {
    try {
      this.logger.log('Fetching unique category list from master skills table');

      // Truy vấn cơ sở dữ liệu và chỉ lấy các giá trị category khác nhau (Distinct)
      const skills = await this.prisma.skill.findMany({
        where: {
          category: {
            not: null, // Loại bỏ các kỹ năng không được gán category ngay từ câu lệnh DB
          },
        },
        select: {
          category: true,
        },
        distinct: ['category'],
        orderBy: {
          category: 'asc', // Sắp xếp theo thứ tự bảng chữ cái từ A-Z cho đẹp UI
        },
      });

      // Map mảng đối tượng thành mảng chuỗi phẳng gởi về Frontend render
      return skills
        .map((s) => s.category)
        .filter((cat): cat is string => !!cat && cat.trim() !== '');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to fetch skill categories: ${message}`);
      return [];
    }
  }

  private buildMatchScoreFilter(
    cvId: string,
    minMatch?: number,
  ): Prisma.CvJobMatchWhereInput {
    if (minMatch === undefined) {
      return {
        cv_id: cvId,
        match_score: { not: null },
      };
    }

    const threshold = Number(minMatch);
    const scoreConditions: Prisma.CvJobMatchWhereInput[] = [
      { match_score: { gte: threshold } },
    ];

    if (threshold > 1) {
      scoreConditions.push({
        AND: [
          { match_score: { gte: threshold / 100 } },
          { match_score: { lte: 1 } },
        ],
      });
    }

    return {
      cv_id: cvId,
      OR: scoreConditions,
    };
  }

  private buildWorkTypeFilter(workType: string): Prisma.JobWhereInput {
    const normalizedWorkType = this.normalizeWorkType(workType);
    const workTypeVariants = this.getWorkTypeVariants(normalizedWorkType);

    if (normalizedWorkType === 'remote') {
      return {
        OR: [{ work_type: { in: workTypeVariants } }, { is_remote: true }],
      };
    }

    return { work_type: { in: workTypeVariants } };
  }

  private normalizeWorkType(value?: string | null): string {
    const normalizedValue = (value || '').trim().toLowerCase();

    switch (normalizedValue) {
      case 'full-time':
      case 'full time':
      case 'fulltime':
      case 'full_time':
        return 'full_time';
      case 'part-time':
      case 'part time':
      case 'parttime':
      case 'part_time':
        return 'part_time';
      case 'contract':
        return 'contract';
      case 'internship':
      case 'intern':
        return 'internship';
      case 'remote':
        return 'remote';
      case 'hybrid':
        return 'hybrid';
      default:
        return normalizedValue;
    }
  }

  private getWorkTypeVariants(workType: string): string[] {
    const variants: Record<string, string[]> = {
      full_time: ['full_time', 'Full-time', 'Full Time', 'Fulltime'],
      part_time: ['part_time', 'Part-time', 'Part Time', 'Parttime'],
      contract: ['contract', 'Contract'],
      internship: ['internship', 'Internship', 'Intern'],
      remote: ['remote', 'Remote'],
      hybrid: ['hybrid', 'Hybrid'],
    };

    return variants[workType] || [workType];
  }

  private normalizeMatchScore(score: unknown): number {
    const rawScore = Number(score || 0);

    if (!Number.isFinite(rawScore)) {
      return 0;
    }

    const normalizedScore = rawScore <= 1 ? rawScore * 100 : rawScore;
    return Math.max(0, Math.min(100, Math.round(normalizedScore)));
  }

  private compareNullableNumbers(
    valueA: number | null,
    valueB: number | null,
    sortOrder: SortOrder,
  ) {
    if (valueA === null && valueB === null) return 0;
    if (valueA === null) return 1;
    if (valueB === null) return -1;

    return sortOrder === SortOrder.DESC ? valueB - valueA : valueA - valueB;
  }
}

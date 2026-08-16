import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { DashboardFilterDto } from './dto/dashboard-filter.dto';
import { DashboardFiltersOptionsResponseDto } from './dto/dashboard-filters-options-response.dto';
import { StatsCardResponseDto } from './dto/stats-response.dto';
import {
  JobPostingTrendsResponseDto,
  TrendDataPointDto,
} from './dto/trends-response.dto';
import { IndustryItemDto } from './dto/industries-response.dto';
import { HotJobItemDto } from './dto/hot-jobs-response.dto';
import { SalaryRangeItemDto } from './dto/salary-ranges-response.dto';
import { InDemandSkillItemDto } from './dto/in-demand-skills-response.dto';
import { RisingSkillItemDto } from './dto/rising-skills-response.dto';
import {
  getNormalizedSalaryRange,
  getSalaryRepresentativeAnnualUsd,
} from '../../common/utils/salary.util';

@Injectable()
export class MarketDashboardService {
  private readonly logger = new Logger(MarketDashboardService.name);
  private readonly WORK_TYPE_OPTIONS = [
    { label: 'Toàn bộ loại hình', value: '' },
    { label: 'Toàn thời gian', value: 'full_time' },
    { label: 'Bán thời gian', value: 'part_time' },
    { label: 'Hợp đồng', value: 'contract' },
    { label: 'Thực tập', value: 'internship' },
    { label: 'Làm từ xa', value: 'remote' },
  ];

  constructor(private readonly prisma: PrismaService) {}

  /**
   * API 0: LẤY CẤU HÌNH OPTIONS CHO CÁC BỘ LỌC ĐẦU VÀO
   */
  async getFiltersOptions(): Promise<DashboardFiltersOptionsResponseDto> {
    try {
      this.logger.log('Fetching dashboard filter options from database');

      // 1. Lấy danh sách Địa điểm duy nhất, loại bỏ rỗng/null
      const distinctLocations = await this.prisma.job.findMany({
        where: {
          AND: [{ location: { not: null } }, { location: { not: '' } }],
        },
        distinct: ['location'],
        select: { location: true },
      });

      const uniqueParsed = new Set<string>();
      for (const j of distinctLocations) {
        if (j.location) {
          const parsed = this.parseLocations(j.location);
          parsed.forEach(p => uniqueParsed.add(p));
        }
      }

      const parsedArray = Array.from(uniqueParsed).sort((a, b) => {
        if (a === 'Khác') return 1;
        if (b === 'Khác') return -1;
        return a.localeCompare(b, 'vi');
      });

      const locations = [
        { label: 'Tất cả khu vực', value: '' },
        ...parsedArray.map((loc) => ({
          label: loc,
          value: loc,
        })),
      ];

      // 2. Cấu hình cố định khoảng thời gian theo yêu cầu BA
      const timeRanges = [
        { label: '7 ngày gần đây', value: '7days' },
        { label: '14 ngày gần đây', value: '14days' },
        { label: '30 ngày gần đây', value: '30days' },
      ];

      // 3. Hình thức công việc dùng value canonical để FE gửi filter ổn định.
      const workTypes = this.WORK_TYPE_OPTIONS;

      return { locations, time_ranges: timeRanges, work_types: workTypes };
    } catch (error: unknown) {
      this.handleError(error, 'Filters Options');
      throw new BadRequestException('Could not fetch filter options');
    }
  }

  /**
   * API 1: THẺ SỐ LIỆU TỔNG QUAN (4 STATS CARDS)
   */
  async getStats(filters: DashboardFilterDto): Promise<StatsCardResponseDto> {
    try {
      this.logger.log(
        `Fetching stats cards with filters: ${JSON.stringify(filters)}`,
      );

      const { currentStart, currentEnd, previousStart, previousEnd } =
        this.calculateTimeBounds(filters.time_range);
      const baseWhere = await this.buildBaseWhereCondition(filters);

      // --- CARD 1: Active Job Postings & Tỷ lệ tăng trưởng phụ ---
      const activeJobsCount = await this.prisma.job.count({
        where: {
          ...baseWhere,
          listed_time: { gte: currentStart, lte: currentEnd },
          OR: [{ expiry_time: { gte: currentEnd } }, { expiry_time: null }],
        },
      });

      const prevActiveJobsCount = await this.prisma.job.count({
        where: {
          ...baseWhere,
          listed_time: { gte: previousStart, lte: previousEnd },
          OR: [{ expiry_time: { gte: previousEnd } }, { expiry_time: null }],
        },
      });

      let growthPercentage = 0;
      if (prevActiveJobsCount > 0) {
        growthPercentage =
          ((activeJobsCount - prevActiveJobsCount) / prevActiveJobsCount) * 100;
      }

      // --- CARD 2: Mức lương IT trung bình lớn (Đã chuẩn hóa) ---
      const salariesRaw = await this.prisma.salary.findMany({
        where: {
          job: {
            ...baseWhere,
            listed_time: { gte: currentStart, lte: currentEnd },
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

      const normalizedMedians: number[] = [];
      let totalNormalizedMedian = 0;
      let globalMin = Infinity;
      let globalMax = -Infinity;

      for (const s of salariesRaw) {
        const normalizedSalary = getNormalizedSalaryRange(s);
        if (!normalizedSalary) continue;

        normalizedMedians.push(normalizedSalary.representative);
        totalNormalizedMedian += normalizedSalary.representative;
        if (normalizedSalary.min < globalMin) globalMin = normalizedSalary.min;
        if (normalizedSalary.max > globalMax) globalMax = normalizedSalary.max;
      }

      const avgSalary =
        normalizedMedians.length > 0
          ? Math.round(totalNormalizedMedian / normalizedMedians.length)
          : 0;

      // --- CARD 3: Companies Hiring (Distinct GroupBy) ---
      const uniqueCompanies = await this.prisma.job.groupBy({
        by: ['company_id'],
        where: {
          ...baseWhere,
          listed_time: { gte: currentStart, lte: currentEnd },
          company_id: { not: null },
          OR: [{ expiry_time: { gte: currentEnd } }, { expiry_time: null }],
        },
      });

      // --- CARD 4: Vị trí thực tập (work_type = internship) ---
      // Hữu ích cho sinh viên: số cơ hội thực tập đang mở
      const internshipJobsCount = await this.prisma.job.count({
        where: {
          ...baseWhere,
          listed_time: { gte: currentStart, lte: currentEnd },
          work_type: { in: this.getWorkTypeVariants('internship') },
          OR: [{ expiry_time: { gte: currentEnd } }, { expiry_time: null }],
        },
      });

      return {
        active_jobs: {
          count: activeJobsCount,
          growth_percentage: Number(growthPercentage.toFixed(1)),
        },
        avg_it_salary: {
          average: avgSalary,
          min: globalMin === Infinity ? 0 : Math.round(globalMin),
          max: globalMax === -Infinity ? 0 : Math.round(globalMax),
        },
        companies_hiring: {
          count: uniqueCompanies.length,
        },
        internship_jobs: {
          count: internshipJobsCount,
        },
      };
    } catch (error: unknown) {
      this.handleError(error, 'Stats Cards');
      throw new BadRequestException('Could not calculate dashboard stats');
    }
  }

  /**
   * API 2: BIỂU ĐỒ ĐƯỜNG XU HƯỚNG TUYỂN DỤNG
   */
  async getTrends(
    filters: DashboardFilterDto,
  ): Promise<JobPostingTrendsResponseDto> {
    try {
      this.logger.log(
        `Fetching trends with filters: ${JSON.stringify(filters)}`,
      );

      const { currentStart, currentEnd } = this.calculateTimeBounds(
        filters.time_range,
      );
      const baseWhere = await this.buildBaseWhereCondition(filters);

      const jobs = await this.prisma.job.findMany({
        where: {
          ...baseWhere,
          listed_time: { gte: currentStart, lte: currentEnd },
        },
        select: { listed_time: true, is_remote: true, work_type: true },
        orderBy: { listed_time: 'asc' },
      });

      let scale: 'hour' | 'day' | 'week' = 'day';
      const trendMap = new Map<string, { total: number; remote: number }>();

      if (filters.time_range === '7days') {
        scale = 'day';
        // Khởi tạo trước các ngày trống để biểu đồ liên tục
        for (let i = 6; i >= 0; i--) {
          const d = new Date();
          d.setDate(d.getDate() - i);
          const label = `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}`;
          trendMap.set(label, { total: 0, remote: 0 });
        }
      } else if (
        filters.time_range === '14days' ||
        filters.time_range === '30days'
      ) {
        scale = 'week';
        trendMap.set('Tuần 1', { total: 0, remote: 0 });
        trendMap.set('Tuần 2', { total: 0, remote: 0 });
        trendMap.set('Tuần 3', { total: 0, remote: 0 });
        trendMap.set('Tuần 4', { total: 0, remote: 0 });
      }

      // Phân bổ dữ liệu thô vào các mốc trục X
      const nowMs = currentEnd.getTime();
      const oneDayMs = 24 * 60 * 60 * 1000;

      for (const job of jobs) {
        if (!job.listed_time) continue;
        const jobDate = new Date(job.listed_time);
        const isRemoteJob =
          job.is_remote === true ||
          this.normalizeWorkType(job.work_type) === 'remote';

        if (scale === 'day') {
          const label = `${jobDate.getDate().toString().padStart(2, '0')}/${(jobDate.getMonth() + 1).toString().padStart(2, '0')}`;
          if (trendMap.has(label)) {
            const current = trendMap.get(label)!;
            current.total += 1;
            if (isRemoteJob) current.remote += 1;
          }
        } else {
          const diffDays = Math.floor((nowMs - jobDate.getTime()) / oneDayMs);
          let weekLabel = 'Tuần 4';

          if (filters.time_range === '30days') {
            if (diffDays >= 21) weekLabel = 'Tuần 1';
            else if (diffDays >= 14) weekLabel = 'Tuần 2';
            else if (diffDays >= 7) weekLabel = 'Tuần 3';
          } else if (filters.time_range === '14days') {
            if (diffDays >= 10.5) weekLabel = 'Tuần 1';
            else if (diffDays >= 7) weekLabel = 'Tuần 2';
            else if (diffDays >= 3.5) weekLabel = 'Tuần 3';
          }

          const current = trendMap.get(weekLabel)!;
          if (current) {
            current.total += 1;
            if (isRemoteJob) current.remote += 1;
          }
        }
      }

      const data: TrendDataPointDto[] = Array.from(trendMap.entries()).map(
        ([label, v]) => ({
          label,
          total_postings: v.total,
          remote_jobs: v.remote,
        }),
      );

      return { x_axis_scale: scale, data };
    } catch (error: unknown) {
      this.handleError(error, 'Trends');
      throw new BadRequestException('Could not compile trends data');
    }
  }

  /**
   * API 3: BIỂU ĐỒ TRÒN PHÂN BỔ CÔNG VIỆC THEO CATEGORY
   */
  async getIndustryBreakdown(
    filters: DashboardFilterDto,
  ): Promise<IndustryItemDto[]> {
    try {
      this.logger.log(
        `Fetching category breakdown with filters: ${JSON.stringify(filters)}`,
      );

      const { currentStart, currentEnd } = this.calculateTimeBounds(
        filters.time_range,
      );
      const baseWhere = await this.buildBaseWhereCondition(filters);

      const jobs = await this.prisma.jobSkill.findMany({
        where: {
          job: {
            ...baseWhere,
            listed_time: { gte: currentStart, lte: currentEnd },
          },
          skill: {
            category: { not: null },
            // Dashboard thị trường chỉ hiển thị nhóm kỹ năng chuyên môn.
            // Loại cả Common skill (kỹ năng mềm) và Certification.
            type: { equals: 'Specialized Skill', mode: 'insensitive' },
          },
        },
        select: {
          skill: {
            select: {
              category: true,
            },
          },
        },
      });

      const categoryMap = new Map<string, number>();
      let totalValidSkills = 0;

      for (const js of jobs) {
        const categoryName = js.skill.category?.trim();
        if (categoryName) {
          categoryMap.set(
            categoryName,
            (categoryMap.get(categoryName) || 0) + 1,
          );
          totalValidSkills += 1;
        }
      }

      // Sắp xếp category theo số lượng giảm dần
      const sortedCategories = Array.from(categoryMap.entries())
        .map(([categoryName, count]) => ({
          category_name: categoryName,
          industry_name: categoryName,
          count,
          percentage:
            totalValidSkills > 0
              ? Number(((count / totalValidSkills) * 100).toFixed(1))
              : 0,
        }))
        .sort((a, b) => b.count - a.count);

      // Gom nhóm từ Top 6 trở đi thành "Khác"
      if (sortedCategories.length <= 6) {
        return sortedCategories;
      }

      const top6 = sortedCategories.slice(0, 5);
      const remaining = sortedCategories.slice(5);

      let othersCount = 0;
      let othersPercentage = 0;
      for (const rem of remaining) {
        othersCount += rem.count;
        othersPercentage += rem.percentage;
      }

      top6.push({
        category_name: 'Khác',
        industry_name: 'Khác',
        count: othersCount,
        percentage: Number(othersPercentage.toFixed(1)),
      });

      return top6;
    } catch (error: unknown) {
      this.handleError(error, 'Category Breakdown');
      throw new BadRequestException('Could not fetch category structure');
    }
  }

  /**
   * API 4: TOP 5 NHÓM VỊ TRÍ ĐƯỢC TUYỂN NHIỀU NHẤT TRONG KHOẢNG THỜI GIAN CHỌN
   */
  async getHotJobs(filters: DashboardFilterDto): Promise<HotJobItemDto[]> {
    try {
      this.logger.log(
        `Fetching hot jobs with filters: ${JSON.stringify(filters)}`,
      );

      const { currentStart, currentEnd } = this.calculateTimeBounds(
        filters.time_range,
      );
      const baseWhere = await this.buildBaseWhereCondition(filters);

      const postingWhere = {
        ...baseWhere,
        listed_time: { gte: currentStart, lte: currentEnd },
        search_group: { not: null },
        OR: [{ expiry_time: { gte: currentEnd } }, { expiry_time: null }],
      };

      // Gom theo nhóm ngành (search_group), đếm số tin tuyển đăng trong khoảng lọc → nhu cầu thị trường
      const groupCounts = await this.prisma.job.groupBy({
        by: ['search_group'],
        where: postingWhere,
        _count: { job_id: true },
        orderBy: { _count: { job_id: 'desc' } },
        take: 5,
      });

      if (groupCounts.length === 0) {
        return [];
      }

      const topGroups = groupCounts
        .map((g) => g.search_group)
        .filter((g): g is string => g !== null);
      const postingCountByGroup = new Map(
        groupCounts
          .filter((g) => g.search_group !== null)
          .map((g) => [g.search_group as string, g._count.job_id]),
      );

      // Lấy chi tiết các tin thuộc top group để tính lương TB, ngành, số công ty
      const jobs = await this.prisma.job.findMany({
        where: { ...postingWhere, search_group: { in: topGroups } },
        select: {
          search_group: true,
          job_category: true,
          location: true,
          work_type: true,
          company_id: true,
          applies: true,
          views: true,
          is_remote: true,
        },
      });

      const aggByGroup = new Map<
        string,
        {
          companyIds: Set<string>;
          jobCategory: string | null;
          location: string | null;
          workType: string | null;
          totalApplies: number;
          totalViews: number;
          remoteCount: number;
        }
      >();

      for (const job of jobs) {
        if (!job.search_group) continue;
        const entry = aggByGroup.get(job.search_group) || {
          companyIds: new Set<string>(),
          jobCategory: null,
          location: null,
          workType: null,
          totalApplies: 0,
          totalViews: 0,
          remoteCount: 0,
        };
        if (job.company_id) entry.companyIds.add(job.company_id.toString());
        if (!entry.jobCategory && job.job_category)
          entry.jobCategory = job.job_category;
        if (!entry.location && job.location) entry.location = job.location;
        if (!entry.workType && job.work_type) entry.workType = job.work_type;
        entry.totalApplies += job.applies || 0;
        entry.totalViews += job.views || 0;
        if (job.is_remote) entry.remoteCount += 1;
        aggByGroup.set(job.search_group, entry);
      }

      const results: HotJobItemDto[] = topGroups
        .map((group) => {
          const agg = aggByGroup.get(group);
          const postingCount = postingCountByGroup.get(group) || 0;

          return {
            job_id: '',
            title: group,
            company_name: null,
            location: agg?.location || null,
            work_type: agg?.workType || null,
            job_category: agg?.jobCategory || 'Khác',
            job_count: postingCount,
            company_count: agg?.companyIds.size || 0,
            total_applies: agg?.totalApplies || 0,
            total_views: agg?.totalViews || 0,
            remote_count: agg?.remoteCount || 0,
          };
        })
        .sort((a, b) => {
          if (b.job_count !== a.job_count) {
            return b.job_count - a.job_count;
          }
          return b.total_applies - a.total_applies;
        })
        .slice(0, 5);

      return results;
    } catch (error: unknown) {
      this.handleError(error, 'Hot Jobs');
      throw new BadRequestException('Could not pull hot jobs analytics');
    }
  }

  /**
   * API 5: BIỂU ĐỒ CỘT ĐÔI DẢI LƯƠNG THEO SKILL CATEGORY (ALL LEVELS)
   */
  async getSalaryRanges(
    filters: DashboardFilterDto,
  ): Promise<SalaryRangeItemDto[]> {
    try {
      this.logger.log(
        `Fetching salary ranges with filters: ${JSON.stringify(filters)}`,
      );

      const { currentStart, currentEnd } = this.calculateTimeBounds(
        filters.time_range,
      );
      const baseWhere = await this.buildBaseWhereCondition(filters);

      const salaryJobWhere: Prisma.JobWhereInput = {
        ...baseWhere,
        listed_time: { gte: currentStart, lte: currentEnd },
        salaries: {
          some: {
            OR: [
              { min_salary: { not: null } },
              { max_salary: { not: null } },
              { med_salary: { not: null } },
            ],
          },
        },
      };

      const jobSkillRecords = await this.prisma.jobSkill.findMany({
        where: {
          job: salaryJobWhere,
          skill: {
            category: { not: null },
          },
        },
        select: {
          job_id: true,
          skill: {
            select: { category: true },
          },
          job: {
            select: {
              salaries: {
                select: {
                  min_salary: true,
                  max_salary: true,
                  med_salary: true,
                  currency: true,
                  pay_period: true,
                },
              },
            },
          },
        },
      });

      const categorySalaryMap = new Map<
        string,
        {
          minSalary: number;
          maxSalary: number;
          jobIds: Set<string>;
          salarySampleCount: number;
        }
      >();
      const seenCategoryJobs = new Set<string>();

      for (const record of jobSkillRecords) {
        const category = record.skill.category?.trim();
        if (!category) continue;

        const jobId = record.job_id.toString();
        const categoryJobKey = `${category}:${jobId}`;
        if (seenCategoryJobs.has(categoryJobKey)) continue;
        seenCategoryJobs.add(categoryJobKey);

        const normalizedRanges = record.job.salaries
          .map(getNormalizedSalaryRange)
          .filter((range): range is NonNullable<typeof range> => !!range);
        if (normalizedRanges.length === 0) continue;

        const current = categorySalaryMap.get(category) || {
          minSalary: Infinity,
          maxSalary: -Infinity,
          jobIds: new Set<string>(),
          salarySampleCount: 0,
        };

        for (const normalizedSalary of normalizedRanges) {
          current.minSalary = Math.min(current.minSalary, normalizedSalary.min);
          current.maxSalary = Math.max(current.maxSalary, normalizedSalary.max);
          current.salarySampleCount += 1;
        }
        current.jobIds.add(jobId);
        categorySalaryMap.set(category, current);
      }

      return Array.from(categorySalaryMap.entries())
        .map(([category, data]) => ({
          role: category,
          min_salary:
            data.minSalary === Infinity ? 0 : Math.round(data.minSalary),
          max_salary:
            data.maxSalary === -Infinity ? 0 : Math.round(data.maxSalary),
          currency: 'USD',
          sample_count: data.jobIds.size,
          salary_sample_count: data.salarySampleCount,
        }))
        .sort((a, b) => {
          if (b.sample_count !== a.sample_count) {
            return b.sample_count - a.sample_count;
          }

          if (b.salary_sample_count !== a.salary_sample_count) {
            return b.salary_sample_count - a.salary_sample_count;
          }

          return b.max_salary - a.max_salary;
        })
        .slice(0, 7)
        .map(({ sample_count, salary_sample_count, ...item }) => item);
    } catch (error: unknown) {
      this.handleError(error, 'Salary Ranges');
      throw new BadRequestException('Could not compile salary ranges');
    }
  }

  /**
   * API 6: BIỂU ĐỒ TOP 10 KỸ NĂNG SĂN ĐÓN (IN-DEMAND SKILLS)
   */
  async getInDemandSkills(
    filters: DashboardFilterDto,
  ): Promise<InDemandSkillItemDto[]> {
    try {
      this.logger.log(
        `Fetching in-demand skills with filters: ${JSON.stringify(filters)}`,
      );

      const { currentStart, currentEnd } = this.calculateTimeBounds(
        filters.time_range,
      );
      const baseWhere = await this.buildBaseWhereCondition(filters);

      // 1. Chỉ dùng 1 câu query duy nhất kéo kèm cả skill_name lên RAM
      const jobSkillsRaw = await this.prisma.jobSkill.findMany({
        where: {
          job: {
            ...baseWhere,
            listed_time: { gte: currentStart, lte: currentEnd },
            OR: [{ expiry_time: { gte: currentEnd } }, { expiry_time: null }],
          },
        },
        include: {
          skill: {
            select: { skill_name: true, type: true, category: true },
          },
        },
      });

      // 2. Gom nhóm và đếm số lượng trên RAM bằng Map — bỏ qua soft skills
      const skillCountMap = new Map<number, { name: string; count: number }>();
      for (const js of jobSkillsRaw) {
        if (!this.isTechnicalSkill(js.skill?.type, js.skill?.category)) continue;
        const existing = skillCountMap.get(js.skill_id);
        const skillName = js.skill?.skill_name || 'Unknown';
        if (existing) {
          existing.count += 1;
        } else {
          skillCountMap.set(js.skill_id, { name: skillName, count: 1 });
        }
      }

      // 3. Sắp xếp giảm dần và lấy Top 10
      const results: InDemandSkillItemDto[] = Array.from(
        skillCountMap.entries(),
      )
        .map(([id, data]) => ({
          skill_id: id,
          skill_name: data.name,
          job_count: data.count,
        }))
        .sort((a, b) => b.job_count - a.job_count)
        .slice(0, 10);

      return results;
    } catch (error: unknown) {
      this.handleError(error, 'In-Demand Skills');
      throw new BadRequestException('Could not compute in-demand skills');
    }
  }

  /**
   * API 7: BIỂU ĐỒ KỸ NĂNG ĐANG LÊN (RISING SKILLS - ĐỐI SÁNH ĐỒNG KỲ PHỨC TẠP)
   */
  async getRisingSkills(
    filters: DashboardFilterDto,
  ): Promise<RisingSkillItemDto[]> {
    try {
      this.logger.log(
        `Fetching rising skills with filters: ${JSON.stringify(filters)}`,
      );

      const { currentStart, currentEnd, previousStart, previousEnd } =
        this.calculateTimeBounds(filters.time_range);
      const baseWhere = await this.buildBaseWhereCondition(filters);

      // 1. Quét Kỳ A (Hiện tại) - include luôn thông tin Skill Name, Type, Category và Salary
      const currentJobSkillsRaw = await this.prisma.jobSkill.findMany({
        where: {
          job: {
            ...baseWhere,
            listed_time: { gte: currentStart, lte: currentEnd },
            OR: [{ expiry_time: { gte: currentEnd } }, { expiry_time: null }],
          },
        },
        include: {
          skill: { select: { skill_name: true, type: true, category: true } },
          job: {
            select: {
              salaries: {
                select: {
                  min_salary: true,
                  max_salary: true,
                  med_salary: true,
                  currency: true,
                  pay_period: true,
                },
              },
            },
          },
        },
      });

      // 2. Quét Kỳ B (Quá khứ đối sánh) - Chỉ cần lấy số lượng để đếm nên không cần include sâu
      const previousJobSkillsRaw = await this.prisma.jobSkill.findMany({
        where: {
          job: {
            ...baseWhere,
            listed_time: { gte: previousStart, lte: previousEnd },
            OR: [{ expiry_time: { gte: previousEnd } }, { expiry_time: null }],
          },
        },
        select: { skill_id: true },
      });

      // 3. Đếm số lượng Kỳ B bằng Map trên RAM
      const prevCountMap = new Map<number, number>();
      for (const ps of previousJobSkillsRaw) {
        prevCountMap.set(ps.skill_id, (prevCountMap.get(ps.skill_id) || 0) + 1);
      }

      // 4. Gom nhóm, tính lương trung bình và thống kê Kỳ A trên RAM
      const currentSkillMap = new Map<
        number,
        {
          name: string;
          countA: number;
          totalSalary: number;
          salaryCount: number;
        }
      >();

      for (const js of currentJobSkillsRaw) {
        const skillId = js.skill_id;
        const skillName = js.skill?.skill_name || 'Unknown';

        // Bỏ qua toàn bộ soft skills — chỉ giữ lại kỹ năng chuyên môn/kỹ thuật
        if (!this.isTechnicalSkill(js.skill?.type, js.skill?.category)) continue;

        if (!currentSkillMap.has(skillId)) {
          currentSkillMap.set(skillId, {
            name: skillName,
            countA: 0,
            totalSalary: 0,
            salaryCount: 0,
          });
        }

        const stats = currentSkillMap.get(skillId)!;
        stats.countA += 1;

        // Tính gộp tiền lương từ các bản ghi Salary của Job này luôn
        const salaries = js.job?.salaries || [];
        for (const s of salaries) {
          const normalizedSalary = getSalaryRepresentativeAnnualUsd(s);
          if (normalizedSalary !== null) {
            stats.totalSalary += normalizedSalary;
            stats.salaryCount += 1;
          }
        }
      }

      // 5. Tính toán Tỷ lệ tăng trưởng kết hợp 2 kỳ [cite: 238, 239]
      // Chỉ xét các kỹ năng có đủ mẫu ở kỳ trước (countB >= MIN_PREV_COUNT).
      // Tránh chia cho 0 / mẫu quá nhỏ tạo ra % tăng trưởng ảo bị phóng đại
      // (ví dụ kỳ trước = 0 tin sẽ cho ra những con số như 1600%).
      const MIN_PREV_COUNT = 5;

      const calculatedSkills: RisingSkillItemDto[] = Array.from(
        currentSkillMap.entries(),
      )
        .filter(([id]) => (prevCountMap.get(id) || 0) >= MIN_PREV_COUNT)
        .map(([id, data]) => {
          const countA = data.countA;
          const countB = prevCountMap.get(id) || 0;

          // countB >= MIN_PREV_COUNT (> 0) nên luôn dùng công thức phần trăm chuẩn
          const growthRate = ((countA - countB) / countB) * 100;

          return {
            skill_id: id,
            skill_name: data.name,
            job_count_current: countA,
            avg_salary:
              data.salaryCount > 0
                ? Math.round(data.totalSalary / data.salaryCount)
                : 0,
            growth_percentage: Number(growthRate.toFixed(1)),
          };
        });

      // 6. Sắp xếp giảm dần theo % tăng trưởng và bốc ra Top 6 [cite: 240]
      return calculatedSkills
        .sort((a, b) => b.growth_percentage - a.growth_percentage)
        .slice(0, 6);
    } catch (error: unknown) {
      this.handleError(error, 'Rising Skills');
      throw new BadRequestException(
        'Could not compute rising skills analytics',
      );
    }
  }

  // ==========================================
  //      CÁC HÀM TRỢ GIÚP NỘI BỘ (HELPERS)
  // ==========================================

  /**
   * Danh sách category được phân loại là soft skill / phi chuyên môn.
   * Dùng làm lớp lọc thứ hai sau khi đã lọc theo `type`.
   */
  private static readonly SOFT_SKILL_CATEGORIES = new Set([
    // Kỹ năng mềm / tính cách cá nhân
    'Personal Attributes',
    'Social Skills',
    'Communication',
    'Initiative and Leadership',
    'Critical Thinking and Problem Solving',
    // Khả năng thể lực / vật lý
    'Physical Abilities',
    'Material Handling',
    // Hành chính / văn phòng tổng quát
    'Administrative Support and Clerical Tasks',
    'Writing and Editing',
    'Office and Productivity Equipment and Technology',
  ]);

  /** Chỉ nhận đúng kỹ năng có type `Specialized Skill`. */
  private isTechnicalSkill(
    type: string | null | undefined,
    _category: string | null | undefined,
  ): boolean {
    return type?.trim().toLowerCase() === 'specialized skill';
  }

  private static readonly VIETNAM_PROVINCES = [
    'Hồ Chí Minh', 'Hà Nội', 'Đà Nẵng', 'Hải Phòng', 'Cần Thơ',
    'An Giang', 'Bà Rịa - Vũng Tàu', 'Bắc Giang', 'Bắc Kạn', 'Bạc Liêu',
    'Bắc Ninh', 'Bến Tre', 'Bình Định', 'Bình Dương', 'Bình Phước',
    'Bình Thuận', 'Cà Mau', 'Cao Bằng', 'Đắk Lắk', 'Đắk Nông',
    'Điện Biên', 'Đồng Nai', 'Đồng Tháp', 'Gia Lai', 'Hà Giang',
    'Hà Nam', 'Hà Tĩnh', 'Hải Dương', 'Hậu Giang', 'Hòa Bình',
    'Hưng Yên', 'Khánh Hòa', 'Kiên Giang', 'Kon Tum', 'Lai Châu',
    'Lâm Đồng', 'Lạng Sơn', 'Lào Cai', 'Long An', 'Nam Định',
    'Nghệ An', 'Ninh Bình', 'Ninh Thuận', 'Phú Thọ', 'Quảng Bình',
    'Quảng Nam', 'Quảng Ngãi', 'Quảng Ninh', 'Quảng Trị', 'Sóc Trăng',
    'Sơn La', 'Tây Ninh', 'Thái Bình', 'Thái Nguyên', 'Thanh Hóa',
    'Thừa Thiên Huế', 'Tiền Giang', 'Trà Vinh', 'Tuyên Quang', 'Vĩnh Long',
    'Vĩnh Phúc', 'Yên Bái', 'Phú Yên'
  ];

  private parseLocations(raw: string): string[] {
    const normalized = raw.toLowerCase();
    const results = new Set<string>();

    // 1. Alias mapping
    if (/ho chi minh|hồ chí minh|\bhcm\b/.test(normalized)) {
      results.add('Hồ Chí Minh');
    }
    if (/ha noi|hà nội|\bhn\b/.test(normalized)) {
      results.add('Hà Nội');
    }
    if (/da nang|đà nẵng/.test(normalized)) {
      results.add('Đà Nẵng');
    }
    if (/\bhue\b|\bhuế\b|thua thien hue|thừa thiên huế/.test(normalized)) {
      results.add('Thừa Thiên Huế');
    }
    if (/vung tau|vũng tàu|ba ria|bà rịa/.test(normalized)) {
      results.add('Bà Rịa - Vũng Tàu');
    }

    // 2. Scan other provinces
    const skip = ['Hồ Chí Minh', 'Hà Nội', 'Đà Nẵng', 'Thừa Thiên Huế', 'Bà Rịa - Vũng Tàu'];
    for (const province of MarketDashboardService.VIETNAM_PROVINCES) {
      if (skip.includes(province)) continue;
      const noAccent = province.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').toLowerCase();
      if (normalized.includes(province.toLowerCase()) || normalized.includes(noAccent)) {
        results.add(province);
      }
    }

    if (results.size === 0) {
      return ['Khác'];
    }
    return Array.from(results);
  }

  /**
   * Tạo điều kiện WHERE cơ bản cho bảng Job ăn theo bộ lọc Địa điểm và Hình thức
   */
  private async buildBaseWhereCondition(
    filters: DashboardFilterDto,
  ): Promise<Prisma.Args<typeof this.prisma.job, 'findMany'>['where']> {
    const condition: Prisma.Args<typeof this.prisma.job, 'findMany'>['where'] =
      {};

    if (filters.location) {
      const distinctLocations = await this.prisma.job.findMany({
        where: {
          AND: [{ location: { not: null } }, { location: { not: '' } }],
        },
        distinct: ['location'],
        select: { location: true },
      });

      const matchingRawLocations = distinctLocations
        .map((j) => j.location!)
        .filter((raw) => {
          const parsed = this.parseLocations(raw);
          return parsed.includes(filters.location!);
        });

      if (matchingRawLocations.length > 0) {
        condition.location = { in: matchingRawLocations };
      } else {
        condition.location = '___NOT_FOUND___';
      }
    }
    if (filters.work_type) {
      const normalizedWorkType = this.normalizeWorkType(filters.work_type);
      const workTypeVariants = this.getWorkTypeVariants(normalizedWorkType);

      if (normalizedWorkType === 'remote') {
        condition.AND = [
          {
            OR: [{ work_type: { in: workTypeVariants } }, { is_remote: true }],
          },
        ];
      } else {
        condition.work_type = { in: workTypeVariants };
      }
    }

    return condition;
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

  /**
   * Xác định mốc thời gian Kỳ A (Hiện tại) và Kỳ B (Quá khứ đối sánh) dựa theo bộ lọc ngắn hạn của BA
   */
  private calculateTimeBounds(timeRange: string): {
    currentStart: Date;
    currentEnd: Date;
    previousStart: Date;
    previousEnd: Date;
  } {
    const currentEnd = new Date(); // Mốc Now (2026)
    const currentStart = new Date();

    let daysDiff = 7;
    if (timeRange === '14days') daysDiff = 14;
    if (timeRange === '30days') daysDiff = 30;

    currentStart.setDate(currentEnd.getDate() - daysDiff);

    const previousEnd = new Date(currentStart);
    const previousStart = new Date(currentStart);
    previousStart.setDate(previousEnd.getDate() - daysDiff);

    return { currentStart, currentEnd, previousStart, previousEnd };
  }

  /**
   * Log tập trung mã lỗi hệ thống
   */
  private handleError(error: unknown, context: string) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const stack = error instanceof Error ? error.stack : '';
    this.logger.error(
      `Dashboard ${context} analysis failed: ${message}`,
      stack,
    );
  }
}

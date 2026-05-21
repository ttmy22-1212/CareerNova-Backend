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

@Injectable()
export class MarketDashboardService {
  private readonly logger = new Logger(MarketDashboardService.name);
  private readonly VND_TO_USD_RATE = 25000; // Tỷ giá quy đổi giả định phục vụ chuẩn hóa tiền tệ

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

      const locations = [
        { label: 'All Regions', value: '' },
        ...distinctLocations.map((j) => ({
          label: j.location!,
          value: j.location!,
        })),
      ];

      // 2. Cấu hình cố định khoảng thời gian theo yêu cầu BA
      const timeRanges = [
        { label: 'Last 7 days', value: '7days' },
        { label: 'Last 2 Weeks', value: '14days' },
        { label: 'Last 1 Month', value: '30days' },
      ];

      // 3. Lấy danh sách hình thức công việc duy nhất từ DB
      const distinctWorkTypes = await this.prisma.job.findMany({
        where: {
          AND: [{ work_type: { not: null } }, { work_type: { not: '' } }],
        },
        distinct: ['work_type'],
        select: { work_type: true },
      });

      const workTypes = [
        { label: 'All Types', value: '' },
        ...distinctWorkTypes.map((j) => ({
          label: j.work_type!,
          value: j.work_type!,
        })),
      ];

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
      const baseWhere = this.buildBaseWhereCondition(filters);

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
        const minVal = Number(s.min_salary || 0);
        const maxVal = Number(s.max_salary || 0);
        const medVal = Number(s.med_salary || 0);

        // Chuẩn hóa chu kỳ sang Năm & Tiền tệ sang USD
        const normMin = this.normalizeSalaryValue(
          minVal,
          s.pay_period,
          s.currency,
        );
        const normMax = this.normalizeSalaryValue(
          maxVal,
          s.pay_period,
          s.currency,
        );
        const normMed = this.normalizeSalaryValue(
          medVal,
          s.pay_period,
          s.currency,
        );

        if (normMed > 0) {
          normalizedMedians.push(normMed);
          totalNormalizedMedian += normMed;
        }
        if (normMin > 0 && normMin < globalMin) globalMin = normMin;
        if (normMax > 0 && normMax > globalMax) globalMax = normMax;
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

      // --- CARD 4: Market Growth YoY (So cùng kỳ năm ngoái) ---
      const yoyCurrentStart = currentStart;
      const yoyCurrentEnd = currentEnd;

      const yoyPastStart = new Date(yoyCurrentStart);
      yoyPastStart.setFullYear(yoyPastStart.getFullYear() - 1);
      const yoyPastEnd = new Date(yoyCurrentEnd);
      yoyPastEnd.setFullYear(yoyPastEnd.getFullYear() - 1);

      const marketJobsCountA = await this.prisma.job.count({
        where: {
          ...baseWhere,
          listed_time: { gte: yoyCurrentStart, lte: yoyCurrentEnd },
        },
      });

      const marketJobsCountB = await this.prisma.job.count({
        where: {
          ...baseWhere,
          listed_time: { gte: yoyPastStart, lte: yoyPastEnd },
        },
      });

      let yoyGrowthPercentage = 0;
      if (marketJobsCountB > 0) {
        yoyGrowthPercentage =
          ((marketJobsCountA - marketJobsCountB) / marketJobsCountB) * 100;
      }

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
        market_growth: {
          yoy_percentage: Number(yoyGrowthPercentage.toFixed(1)),
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
      const baseWhere = this.buildBaseWhereCondition(filters);

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
        trendMap.set('Week 1', { total: 0, remote: 0 });
        trendMap.set('Week 2', { total: 0, remote: 0 });
        trendMap.set('Week 3', { total: 0, remote: 0 });
        trendMap.set('Week 4', { total: 0, remote: 0 });
      }

      // Phân bổ dữ liệu thô vào các mốc trục X
      const nowMs = currentEnd.getTime();
      const oneDayMs = 24 * 60 * 60 * 1000;

      for (const job of jobs) {
        if (!job.listed_time) continue;
        const jobDate = new Date(job.listed_time);
        const isRemoteJob =
          job.is_remote === true || job.work_type === 'Remote';

        if (scale === 'day') {
          const label = `${jobDate.getDate().toString().padStart(2, '0')}/${(jobDate.getMonth() + 1).toString().padStart(2, '0')}`;
          if (trendMap.has(label)) {
            const current = trendMap.get(label)!;
            current.total += 1;
            if (isRemoteJob) current.remote += 1;
          }
        } else {
          const diffDays = Math.floor((nowMs - jobDate.getTime()) / oneDayMs);
          let weekLabel = 'Week 4';

          if (filters.time_range === '30days') {
            if (diffDays >= 21) weekLabel = 'Week 1';
            else if (diffDays >= 14) weekLabel = 'Week 2';
            else if (diffDays >= 7) weekLabel = 'Week 3';
          } else if (filters.time_range === '14days') {
            if (diffDays >= 10.5) weekLabel = 'Week 1';
            else if (diffDays >= 7) weekLabel = 'Week 2';
            else if (diffDays >= 3.5) weekLabel = 'Week 3';
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
   * API 3: BIỂU ĐỒ TRÒN CƠ CẤU NGÀNH NGHỀ (TRUY VẤN BẮC CẦU 4 BẢNG)
   */
  async getIndustryBreakdown(
    filters: DashboardFilterDto,
  ): Promise<IndustryItemDto[]> {
    try {
      this.logger.log(
        `Fetching industry breakdown with filters: ${JSON.stringify(filters)}`,
      );

      const { currentStart, currentEnd } = this.calculateTimeBounds(
        filters.time_range,
      );
      const baseWhere = this.buildBaseWhereCondition(filters);

      // Lấy tất cả các tin tuyển dụng còn hạn thỏa bộ lọc
      const jobs = await this.prisma.job.findMany({
        where: {
          ...baseWhere,
          listed_time: { gte: currentStart, lte: currentEnd },
          OR: [{ expiry_time: { gte: currentEnd } }, { expiry_time: null }],
          company_id: { not: null },
        },
        select: {
          company: {
            select: {
              company_industries: {
                select: {
                  industry: { select: { industry_name: true } },
                },
              },
            },
          },
        },
      });

      const industryMap = new Map<string, number>();
      let totalValidJobs = 0;

      for (const j of jobs) {
        const companyIndustries = j.company?.company_industries || [];
        for (const ci of companyIndustries) {
          const name = ci.industry?.industry_name;
          if (name) {
            industryMap.set(name, (industryMap.get(name) || 0) + 1);
            totalValidJobs += 1;
          }
        }
      }

      // Sắp xếp các ngành theo số lượng giảm dần
      const sortedIndustries = Array.from(industryMap.entries())
        .map(([name, count]) => ({
          industry_name: name,
          count,
          percentage:
            totalValidJobs > 0
              ? Number(((count / totalValidJobs) * 100).toFixed(1))
              : 0,
        }))
        .sort((a, b) => b.count - a.count);

      // Gom nhóm từ Top 6 trở đi thành "Others"
      if (sortedIndustries.length <= 6) {
        return sortedIndustries;
      }

      const top6 = sortedIndustries.slice(0, 5);
      const remaining = sortedIndustries.slice(5);

      let othersCount = 0;
      let othersPercentage = 0;
      for (const rem of remaining) {
        othersCount += rem.count;
        othersPercentage += rem.percentage;
      }

      top6.push({
        industry_name: 'Others',
        count: othersCount,
        percentage: Number(othersPercentage.toFixed(1)),
      });

      return top6;
    } catch (error: unknown) {
      this.handleError(error, 'Industry Breakdown');
      throw new BadRequestException('Could not fetch industry structure');
    }
  }

  /**
   * API 4: BIỂU ĐỒ VỊ TRÍ TUYỂN DỤNG HOT (TOP 5 HOT JOBS)
   */
  async getHotJobs(filters: DashboardFilterDto): Promise<HotJobItemDto[]> {
    try {
      this.logger.log(
        `Fetching hot jobs with filters: ${JSON.stringify(filters)}`,
      );

      const { currentStart, currentEnd } = this.calculateTimeBounds(
        filters.time_range,
      );
      const baseWhere = this.buildBaseWhereCondition(filters);

      // 1. Quét 1 lần lấy Job kèm thông tin Salary luôn
      const jobsWithSalaries = await this.prisma.job.findMany({
        where: {
          ...baseWhere,
          listed_time: { gte: currentStart, lte: currentEnd },
          AND: [{ job_category: { not: null } }, { job_category: { not: '' } }],
          OR: [{ expiry_time: { gte: currentEnd } }, { expiry_time: null }], // Đã sửa lỗi 1
        },
        select: {
          job_category: true,
          salaries: {
            select: { med_salary: true, currency: true, pay_period: true },
          },
        },
      });

      // 2. Phân tích và gom dữ liệu trên RAM
      const categoryMap = new Map<
        string,
        { count: number; totalSalary: number; salaryCount: number }
      >();

      for (const job of jobsWithSalaries) {
        const cat = job.job_category!;
        if (!categoryMap.has(cat)) {
          categoryMap.set(cat, { count: 0, totalSalary: 0, salaryCount: 0 });
        }

        const stats = categoryMap.get(cat)!;
        stats.count += 1;

        for (const s of job.salaries) {
          const normMed = this.normalizeSalaryValue(
            Number(s.med_salary || 0),
            s.pay_period,
            s.currency,
          );
          if (normMed > 0) {
            stats.totalSalary += normMed;
            stats.salaryCount += 1;
          }
        }
      }

      // 3. Map kết quả, sắp xếp lấy Top 5
      const results: HotJobItemDto[] = Array.from(categoryMap.entries())
        .map(([category, stats]) => ({
          job_category: category,
          job_count: stats.count,
          avg_salary:
            stats.salaryCount > 0
              ? Math.round(stats.totalSalary / stats.salaryCount)
              : 0,
        }))
        .sort((a, b) => b.job_count - a.job_count)
        .slice(0, 5);

      return results;
    } catch (error: unknown) {
      this.handleError(error, 'Hot Jobs');
      throw new BadRequestException('Could not pull hot jobs analytics');
    }
  }

  /**
   * API 5: BIỂU ĐỒ CỘT ĐÔI DẢI LƯƠNG (ALL LEVELS)
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
      const baseWhere = this.buildBaseWhereCondition(filters);

      // Bốc ra Top 6 job_category có nhiều bài đăng nhất
      const topCategories = await this.prisma.job.groupBy({
        by: ['job_category'],
        _count: { job_id: true },
        where: {
          ...baseWhere,
          listed_time: { gte: currentStart, lte: currentEnd },
          AND: [{ job_category: { not: null } }, { job_category: { not: '' } }],
        },
        orderBy: { _count: { job_id: 'desc' } },
        take: 6,
      });

      const results = await Promise.all(
        topCategories.map(async (c) => {
          const salaries = await this.prisma.salary.findMany({
            where: {
              job: {
                ...baseWhere,
                listed_time: { gte: currentStart, lte: currentEnd },
                job_category: c.job_category,
              },
            },
            select: {
              min_salary: true,
              max_salary: true,
              currency: true,
              pay_period: true,
            },
          });

          let minSalary = Infinity;
          let maxSalary = -Infinity;

          for (const s of salaries) {
            const normMin = this.normalizeSalaryValue(
              Number(s.min_salary || 0),
              s.pay_period,
              s.currency,
            );
            const normMax = this.normalizeSalaryValue(
              Number(s.max_salary || 0),
              s.pay_period,
              s.currency,
            );

            if (normMin > 0 && normMin < minSalary) minSalary = normMin;
            if (normMax > 0 && normMax > maxSalary) maxSalary = normMax;
          }

          return {
            role: c.job_category!,
            min_salary: minSalary === Infinity ? 0 : Math.round(minSalary),
            max_salary: maxSalary === -Infinity ? 0 : Math.round(maxSalary),
            currency: 'USD',
          };
        }),
      );

      return results;
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
      const baseWhere = this.buildBaseWhereCondition(filters);

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
            select: { skill_name: true },
          },
        },
      });

      // 2. Gom nhóm và đếm số lượng trên RAM bằng Map
      const skillCountMap = new Map<number, { name: string; count: number }>();
      for (const js of jobSkillsRaw) {
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
      const baseWhere = this.buildBaseWhereCondition(filters);

      // 1. Quét Kỳ A (Hiện tại) - include luôn thông tin Skill Name và Salary để xử lý trên RAM
      const currentJobSkillsRaw = await this.prisma.jobSkill.findMany({
        where: {
          job: {
            ...baseWhere,
            listed_time: { gte: currentStart, lte: currentEnd },
          },
        },
        include: {
          skill: { select: { skill_name: true } },
          job: {
            select: {
              salaries: {
                select: { med_salary: true, currency: true, pay_period: true },
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
          const normMed = this.normalizeSalaryValue(
            Number(s.med_salary || 0),
            s.pay_period,
            s.currency,
          );
          if (normMed > 0) {
            stats.totalSalary += normMed;
            stats.salaryCount += 1;
          }
        }
      }

      // 5. Tính toán Tỷ lệ tăng trưởng kết hợp 2 kỳ [cite: 238, 239]
      const calculatedSkills: RisingSkillItemDto[] = Array.from(
        currentSkillMap.entries(),
      ).map(([id, data]) => {
        const countA = data.countA;
        const countB = prevCountMap.get(id) || 0;

        let growthRate = 0;
        if (countB > 0) {
          growthRate = ((countA - countB) / countB) * 100;
        } else {
          growthRate = countA * 100; // Quy ước tăng trưởng nhảy vọt nếu kỳ trước chưa có post nào
        }

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
   * Tạo điều kiện WHERE cơ bản cho bảng Job ăn theo bộ lọc Địa điểm và Hình thức
   */
  private buildBaseWhereCondition(
    filters: DashboardFilterDto,
  ): Prisma.Args<typeof this.prisma.job, 'findMany'>['where'] {
    const condition: Prisma.Args<typeof this.prisma.job, 'findMany'>['where'] =
      {};

    if (filters.location) {
      condition.location = filters.location;
    }
    if (filters.work_type) {
      if (filters.work_type === 'Remote') {
        condition.OR = [{ work_type: 'Remote' }, { is_remote: true }];
      } else {
        condition.work_type = filters.work_type;
      }
    }

    return condition;
  }

  /**
   * Chuẩn hóa tiền tệ (về USD) và chu kỳ lương (về Hệ Năm)
   */
  private normalizeSalaryValue(
    val: number,
    payPeriod: string | null,
    currency: string | null,
  ): number {
    if (!val || val <= 0) return 0;

    let annualVal = val;
    // 1. Chuẩn hóa chu kỳ về Năm
    if (payPeriod === 'monthly') {
      annualVal = val * 12;
    }

    // 2. Chuẩn hóa tiền tệ về USD
    if (currency === 'VND') {
      annualVal = annualVal / this.VND_TO_USD_RATE;
    }

    return annualVal;
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

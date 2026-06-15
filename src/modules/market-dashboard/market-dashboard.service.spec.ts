import { describe, expect, it, jest } from '@jest/globals';
import { MarketDashboardService } from './market-dashboard.service';
import { PrismaService } from '../../prisma/prisma.service';

type SalaryFixture = {
  min_salary?: number | null;
  max_salary?: number | null;
  med_salary?: number | null;
  currency?: string | null;
  pay_period?: string | null;
};

type JobSkillFixture = {
  job_id: bigint;
  skill: { category: string | null };
  job: { salaries: SalaryFixture[] };
};

function createService(jobSkillRecords: JobSkillFixture[]) {
  const findMany = jest.fn(async () => jobSkillRecords);
  const prisma = {
    jobSkill: { findMany },
  } as unknown as PrismaService;

  return {
    service: new MarketDashboardService(prisma),
    findMany,
  };
}

describe('MarketDashboardService.getSalaryRanges', () => {
  it('groups salary ranges by skill category and counts each job once per category', async () => {
    const { service } = createService([
      {
        job_id: 1n,
        skill: { category: 'Backend' },
        job: {
          salaries: [
            {
              min_salary: 1000,
              max_salary: 2000,
              currency: 'USD',
              pay_period: 'monthly',
            },
          ],
        },
      },
      {
        job_id: 1n,
        skill: { category: 'Backend' },
        job: {
          salaries: [
            {
              min_salary: 1000,
              max_salary: 2000,
              currency: 'USD',
              pay_period: 'monthly',
            },
          ],
        },
      },
      {
        job_id: 2n,
        skill: { category: 'Data' },
        job: {
          salaries: [
            {
              min_salary: 90000,
              max_salary: 100000,
              currency: 'USD',
              pay_period: 'yearly',
            },
          ],
        },
      },
      {
        job_id: 3n,
        skill: { category: 'Frontend' },
        job: {
          salaries: [
            {
              min_salary: 1000,
              max_salary: 2000,
              currency: 'EUR',
              pay_period: 'yearly',
            },
          ],
        },
      },
      {
        job_id: 4n,
        skill: { category: '' },
        job: {
          salaries: [
            {
              med_salary: 50000,
              currency: 'USD',
              pay_period: 'yearly',
            },
          ],
        },
      },
    ]);

    await expect(
      service.getSalaryRanges({ time_range: '30days' }),
    ).resolves.toEqual([
      {
        role: 'Data',
        min_salary: 90000,
        max_salary: 100000,
        currency: 'USD',
      },
      {
        role: 'Backend',
        min_salary: 12000,
        max_salary: 24000,
        currency: 'USD',
      },
    ]);
  });

  it('returns only the top 7 categories', async () => {
    const records: JobSkillFixture[] = Array.from({ length: 8 }, (_, index) => ({
      job_id: BigInt(index + 1),
      skill: { category: `Category ${index + 1}` },
      job: {
        salaries: [
          {
            min_salary: 10000 + index,
            max_salary: 10000 + index,
            currency: 'USD',
            pay_period: 'yearly',
          },
        ],
      },
    }));
    const { service } = createService(records);

    const result = await service.getSalaryRanges({ time_range: '30days' });

    expect(result).toHaveLength(7);
    expect(result.map((item) => item.role)).toEqual([
      'Category 8',
      'Category 7',
      'Category 6',
      'Category 5',
      'Category 4',
      'Category 3',
      'Category 2',
    ]);
  });
});

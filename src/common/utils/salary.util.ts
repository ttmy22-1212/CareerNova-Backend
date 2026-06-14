export type SalaryLike = {
  min_salary?: unknown | null;
  max_salary?: unknown | null;
  med_salary?: unknown | null;
  currency?: string | null;
  pay_period?: string | null;
};

export type NormalizedSalaryRange = {
  min: number;
  max: number;
  representative: number;
};

const VND_TO_USD_RATE = 25000;

export function getPositiveNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;

  const numericValue = Number(value);
  return Number.isFinite(numericValue) && numericValue > 0
    ? numericValue
    : null;
}

export function hasConcreteSalary(salary: SalaryLike | null | undefined) {
  if (!salary) return false;

  return (
    getPositiveNumber(salary.min_salary) !== null ||
    getPositiveNumber(salary.max_salary) !== null ||
    getPositiveNumber(salary.med_salary) !== null
  );
}

export function normalizeSalaryAmountToAnnualUsd(
  value: unknown,
  payPeriod: string | null | undefined,
  currency: string | null | undefined,
): number | null {
  const amount = getPositiveNumber(value);
  if (amount === null) return null;

  const annualMultiplier = getAnnualMultiplier(payPeriod);
  if (annualMultiplier === null) return null;

  const normalizedCurrency = normalizeCurrency(currency);
  if (!normalizedCurrency) return null;
  if (normalizedCurrency !== 'VND' && normalizedCurrency !== 'USD') {
    return null;
  }

  const annualAmount = amount * annualMultiplier;
  if (normalizedCurrency === 'VND') {
    return annualAmount / VND_TO_USD_RATE;
  }

  return annualAmount;
}

export function getNormalizedSalaryRange(
  salary: SalaryLike | null | undefined,
): NormalizedSalaryRange | null {
  if (!salary || !hasConcreteSalary(salary)) return null;

  const min = normalizeSalaryAmountToAnnualUsd(
    salary.min_salary,
    salary.pay_period,
    salary.currency,
  );
  const max = normalizeSalaryAmountToAnnualUsd(
    salary.max_salary,
    salary.pay_period,
    salary.currency,
  );
  const med = normalizeSalaryAmountToAnnualUsd(
    salary.med_salary,
    salary.pay_period,
    salary.currency,
  );

  const lowerBound = min ?? med ?? max;
  const upperBound = max ?? med ?? min;
  if (lowerBound === null || upperBound === null) return null;

  const normalizedMin = Math.min(lowerBound, upperBound);
  const normalizedMax = Math.max(lowerBound, upperBound);

  return {
    min: normalizedMin,
    max: normalizedMax,
    representative: med ?? (normalizedMin + normalizedMax) / 2,
  };
}

export function getSalaryRepresentativeAnnualUsd(
  salary: SalaryLike | null | undefined,
): number | null {
  return getNormalizedSalaryRange(salary)?.representative ?? null;
}

export function getBestSalaryRecord<T extends SalaryLike>(
  salaries: T[] | null | undefined,
): T | null {
  if (!salaries || salaries.length === 0) return null;

  return salaries.reduce<T | null>((best, current) => {
    if (!best) return current;

    const currentValue = getSalaryRepresentativeAnnualUsd(current);
    const bestValue = getSalaryRepresentativeAnnualUsd(best);

    if (currentValue === null && bestValue === null) return best;
    if (currentValue === null) return best;
    if (bestValue === null) return current;

    return currentValue > bestValue ? current : best;
  }, null);
}

export function summarizeNormalizedSalaries(
  salaries: Array<SalaryLike | null | undefined>,
) {
  const values = salaries
    .map(getSalaryRepresentativeAnnualUsd)
    .filter((value): value is number => value !== null)
    .sort((a, b) => a - b);

  if (values.length === 0) {
    return {
      count: 0,
      average: 0,
      median: 0,
      percentile75: 0,
    };
  }

  const total = values.reduce((sum, value) => sum + value, 0);

  return {
    count: values.length,
    average: total / values.length,
    median: calculatePercentile(values, 0.5),
    percentile75: calculatePercentile(values, 0.75),
  };
}

export function formatSalaryText(
  salaries: Array<SalaryLike | null | undefined>,
): string {
  const salary =
    salaries.find((item) => hasConcreteSalary(item)) ?? salaries[0] ?? null;

  if (!salary || !hasConcreteSalary(salary)) {
    return 'Thỏa thuận';
  }

  const currency = normalizeCurrency(salary.currency) || 'VND';
  const periodLabel = getPayPeriodLabel(salary.pay_period);
  const min = getPositiveNumber(salary.min_salary);
  const max = getPositiveNumber(salary.max_salary);
  const med = getPositiveNumber(salary.med_salary);

  if (min !== null && max !== null) {
    return `${formatRawAmount(min, currency)} - ${formatRawAmount(
      max,
      currency,
    )} ${currency}${periodLabel}`;
  }

  if (min !== null) {
    return `Từ ${formatRawAmount(min, currency)} ${currency}${periodLabel}`;
  }

  if (max !== null) {
    return `Đến ${formatRawAmount(max, currency)} ${currency}${periodLabel}`;
  }

  return `${formatRawAmount(med!, currency)} ${currency}${periodLabel}`;
}

export function formatUsdAnnualSalaryRange(min: number, max: number): string {
  if (min <= 0 && max <= 0) return 'Thỏa thuận';

  const finalMin = min > 0 ? min : max;
  const finalMax = max > 0 ? max : min;

  return `${formatUsdAmount(finalMin)} - ${formatUsdAmount(finalMax)} USD/năm`;
}

function calculatePercentile(sortedValues: number[], percentile: number) {
  if (sortedValues.length === 0) return 0;

  const index = Math.floor(percentile * (sortedValues.length - 1));
  return sortedValues[index];
}

function normalizeCurrency(currency: string | null | undefined): string | null {
  const normalizedCurrency = (currency || '').trim().toUpperCase();

  if (!normalizedCurrency || normalizedCurrency === 'UNKNOWN') return null;
  if (['VND', 'VNĐ', 'DONG', 'Đ'].includes(normalizedCurrency)) return 'VND';
  if (normalizedCurrency === 'USD') return 'USD';

  return normalizedCurrency;
}

function getAnnualMultiplier(payPeriod: string | null | undefined) {
  const normalizedPeriod = (payPeriod || '').trim().toLowerCase();

  switch (normalizedPeriod) {
    case 'hourly':
    case 'hour':
      return 2080;
    case 'daily':
    case 'day':
      return 260;
    case 'weekly':
    case 'week':
      return 52;
    case 'monthly':
    case 'month':
      return 12;
    case 'yearly':
    case 'annual':
    case 'annually':
    case 'year':
      return 1;
    default:
      return null;
  }
}

function getPayPeriodLabel(payPeriod: string | null | undefined) {
  const normalizedPeriod = (payPeriod || '').trim().toLowerCase();

  switch (normalizedPeriod) {
    case 'hourly':
    case 'hour':
      return '/giờ';
    case 'daily':
    case 'day':
      return '/ngày';
    case 'weekly':
    case 'week':
      return '/tuần';
    case 'monthly':
    case 'month':
      return '/tháng';
    case 'yearly':
    case 'annual':
    case 'annually':
    case 'year':
      return '/năm';
    default:
      return '';
  }
}

function formatRawAmount(value: number, currency: string) {
  if (currency === 'VND') {
    return Math.round(value).toLocaleString('vi-VN');
  }

  return Math.round(value).toLocaleString('en-US');
}

function formatUsdAmount(value: number) {
  return Math.round(value).toLocaleString('en-US');
}

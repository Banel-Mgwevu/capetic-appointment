import { addDays, type LocalDate } from '../domain/time.js';
import type { AnalyticsRepository } from '../repositories/analyticsRepository.js';

export interface AnalyticsSummary {
  rangeDays: number;
  since: LocalDate;
  totals: { confirmed: number; cancelled: number; total: number; cancellationRate: number };
  byBranch: { branchId: number; branchName: string; confirmed: number; cancelled: number }[];
  byService: { serviceId: number; serviceName: string; confirmed: number }[];
  byDay: { date: string; confirmed: number; cancelled: number }[];
  byHour: { hour: string; confirmed: number }[];
  busiestBranch: string | null;
  busiestService: string | null;
  busiestHour: string | null;
}

export class AnalyticsService {
  constructor(
    private readonly repo: AnalyticsRepository,
    private readonly clock: () => Date,
  ) {}

  summary(rangeDays: number): AnalyticsSummary {
    const today = this.clock().toISOString().slice(0, 10);
    const since = addDays(today, -rangeDays);

    const totals = this.repo.totals(since);
    const byBranch = this.repo.byBranch(since);
    const byService = this.repo.byService(since);
    const byDay = this.repo.byDay(since);
    const byHour = this.repo.byHour(since);

    return {
      rangeDays,
      since,
      totals: {
        ...totals,
        cancellationRate: totals.total === 0 ? 0 : Math.round((totals.cancelled / totals.total) * 1000) / 10,
      },
      byBranch,
      byService,
      byDay,
      byHour,
      busiestBranch: topBy(byBranch, (b) => b.confirmed)?.branchName ?? null,
      busiestService: topBy(byService, (s) => s.confirmed)?.serviceName ?? null,
      busiestHour: topBy(byHour, (h) => h.confirmed)?.hour ?? null,
    };
  }
}

function topBy<T>(items: T[], score: (item: T) => number): T | undefined {
  return items.reduce<T | undefined>((best, item) => (best === undefined || score(item) > score(best) ? item : best), undefined);
}

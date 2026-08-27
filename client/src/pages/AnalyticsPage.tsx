import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarList } from '../components/BarList';
import { Notice } from '../components/Notice';
import { api, ApiError } from '../lib/api';
import { formatShortDate } from '../lib/dates';
import { clearAdminToken, getAdminToken } from '../lib/session';
import type { AnalyticsSummary } from '../lib/types';

const RANGE_OPTIONS = [7, 30, 90];

export function AnalyticsPage() {
  const navigate = useNavigate();
  const [rangeDays, setRangeDays] = useState(30);
  const [data, setData] = useState<AnalyticsSummary>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!getAdminToken()) {
      navigate('/admin/login', { replace: true });
      return;
    }
    let cancelled = false;
    api
      .analytics(rangeDays)
      .then((summary) => {
        if (!cancelled) setData(summary);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        if (e instanceof ApiError && e.status === 401) {
          clearAdminToken();
          navigate('/admin/login', { replace: true });
          return;
        }
        setError(e instanceof Error ? e.message : 'Could not load analytics.');
      });
    return () => {
      cancelled = true;
    };
  }, [rangeDays, navigate]);

  const signOut = () => {
    clearAdminToken();
    navigate('/admin/login');
  };

  if (error) {
    return (
      <div className="page">
        <Notice tone="error">{error}</Notice>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="page">
        <p className="muted">Loading analytics…</p>
      </div>
    );
  }

  const dayItems = data.byDay.map((d) => ({
    label: formatShortDate(d.date),
    value: d.confirmed,
    secondaryValue: d.cancelled || undefined,
  }));
  const branchItems = data.byBranch.map((b) => ({
    label: b.branchName,
    value: b.confirmed,
    secondaryValue: b.cancelled || undefined,
  }));
  const serviceItems = data.byService.map((s) => ({ label: s.serviceName, value: s.confirmed }));
  const hourItems = data.byHour
    .filter((h) => h.confirmed > 0)
    .map((h) => ({ label: `${h.hour}:00`, value: h.confirmed }));

  return (
    <div className="page">
      <header className="page__head analytics__head">
        <div>
          <p className="eyebrow">Staff dashboard</p>
          <h1>Branch appointment analytics</h1>
          <p className="lead">
            Showing bookings from {formatShortDate(data.since)} onward
            {data.busiestBranch && <> · Busiest branch: <strong>{data.busiestBranch}</strong></>}
          </p>
        </div>
        <div className="analytics__controls">
          <div className="segmented" role="group" aria-label="Date range">
            {RANGE_OPTIONS.map((option) => (
              <button
                key={option}
                type="button"
                className={`segmented__option ${option === rangeDays ? 'segmented__option--active' : ''}`}
                onClick={() => setRangeDays(option)}
              >
                {option}d
              </button>
            ))}
          </div>
          <button type="button" className="button button--ghost" onClick={signOut}>
            Sign out
          </button>
        </div>
      </header>

      <div className="stat-grid">
        <div className="stat-card">
          <span className="stat-card__label">Confirmed</span>
          <span className="stat-card__value">{data.totals.confirmed}</span>
        </div>
        <div className="stat-card">
          <span className="stat-card__label">Cancelled</span>
          <span className="stat-card__value">{data.totals.cancelled}</span>
        </div>
        <div className="stat-card">
          <span className="stat-card__label">Cancellation rate</span>
          <span className="stat-card__value">{data.totals.cancellationRate}%</span>
        </div>
        <div className="stat-card">
          <span className="stat-card__label">Busiest hour</span>
          <span className="stat-card__value">{data.busiestHour ? `${data.busiestHour}:00` : '—'}</span>
        </div>
      </div>

      <div className="analytics__grid">
        <section className="card">
          <h2>Bookings by day</h2>
          <BarList items={dayItems} />
        </section>
        <section className="card">
          <h2>Bookings by branch</h2>
          <BarList items={branchItems} />
        </section>
        <section className="card">
          <h2>Bookings by service</h2>
          <BarList items={serviceItems} />
        </section>
        <section className="card">
          <h2>Bookings by hour of day</h2>
          <BarList items={hourItems} />
        </section>
      </div>
    </div>
  );
}

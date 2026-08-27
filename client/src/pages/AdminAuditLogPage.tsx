import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Notice } from '../components/Notice';
import { Spinner } from '../components/Spinner';
import { StaffNav } from '../components/StaffNav';
import { api, ApiError } from '../lib/api';
import { clearAdminToken, getAdminToken } from '../lib/session';
import type { AuditEntry } from '../lib/types';

const ACTION_LABELS: Record<string, string> = {
  ADMIN_LOGIN_SUCCESS: 'Signed in',
  ADMIN_LOGIN_FAILURE: 'Failed sign-in attempt',
  APPOINTMENT_LOOKUP: 'Looked up a booking',
  APPOINTMENT_CANCELLED_BY_STAFF: 'Cancelled a booking',
  APPOINTMENT_RESCHEDULED_BY_STAFF: 'Rescheduled a booking',
  PRIVACY_PURGE_TRIGGERED: 'Ran a data retention purge',
};

function describe(entry: AuditEntry): string {
  return ACTION_LABELS[entry.action] ?? entry.action;
}

export function AdminAuditLogPage() {
  const navigate = useNavigate();
  const [entries, setEntries] = useState<AuditEntry[]>();
  const [error, setError] = useState<string>();
  const [purging, setPurging] = useState(false);
  const [purgeResult, setPurgeResult] = useState<string>();

  const load = () => {
    api
      .auditLog(100)
      .then((result) => setEntries(result))
      .catch((e: unknown) => {
        if (e instanceof ApiError && e.status === 401) {
          clearAdminToken();
          navigate('/admin/login', { replace: true });
          return;
        }
        setError(e instanceof Error ? e.message : 'Could not load the audit log.');
      });
  };

  useEffect(() => {
    if (!getAdminToken()) {
      navigate('/admin/login', { replace: true });
      return;
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate]);

  const runPurge = async () => {
    setPurging(true);
    setPurgeResult(undefined);
    try {
      const { redactedCount } = await api.triggerPrivacyPurge();
      setPurgeResult(
        redactedCount === 0
          ? 'No bookings were old enough to redact.'
          : `Redacted personal details on ${redactedCount} booking${redactedCount === 1 ? '' : 's'}.`,
      );
      load();
    } catch (e) {
      setPurgeResult(e instanceof Error ? e.message : 'Could not run the purge.');
    } finally {
      setPurging(false);
    }
  };

  if (error) {
    return (
      <div className="page">
        <StaffNav />
        <Notice tone="error">{error}</Notice>
      </div>
    );
  }

  return (
    <div className="page">
      <StaffNav />
      <header className="page__head">
        <h1>Audit log</h1>
        <p className="lead">
          Staff sign-ins and any lookup or change made to a customer's booking on their behalf. Customers acting on
          their own bookings are not logged here.
        </p>
      </header>

      <section className="card" style={{ marginBottom: 24 }}>
        <h2>Data retention</h2>
        <p>
          Bookings past the retention window have their personal details redacted automatically on a schedule. You
          can also run it now.
        </p>
        {purgeResult && <Notice tone="info">{purgeResult}</Notice>}
        <div className="step__actions">
          <button type="button" className="button button--secondary" disabled={purging} onClick={() => void runPurge()}>
            {purging && <Spinner />}
            {purging ? 'Running' : 'Run purge now'}
          </button>
        </div>
      </section>

      {!entries ? (
        <p className="muted">Loading audit log…</p>
      ) : entries.length === 0 ? (
        <p className="muted">No audit entries yet.</p>
      ) : (
        <table className="audit-table">
          <thead>
            <tr>
              <th>When</th>
              <th>Staff member</th>
              <th>Action</th>
              <th>Booking</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.id}>
                <td className="audit-table__time">{new Date(entry.createdAt).toLocaleString('en-ZA')}</td>
                <td>{entry.actor}</td>
                <td>{describe(entry)}</td>
                <td className="audit-table__ref">{entry.targetId ?? 'N/A'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

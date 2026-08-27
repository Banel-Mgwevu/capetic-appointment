import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Field } from '../components/Field';
import { Notice } from '../components/Notice';
import { Spinner } from '../components/Spinner';
import { StaffNav } from '../components/StaffNav';
import { Ticket } from '../components/Ticket';
import { api, ApiError } from '../lib/api';
import { clearAdminToken, getAdminToken } from '../lib/session';
import type { AppointmentResponse } from '../lib/types';

function normaliseReference(input: string): string {
  const cleaned = input.trim().toUpperCase().replace(/\s+/g, '');
  return cleaned.startsWith('APT-') ? cleaned : `APT-${cleaned}`;
}

/**
 * Staff support tool: pull up any customer's booking by reference alone (no
 * contact verification needed, since the admin is already authenticated) and
 * act on it -- cancel or reschedule on the customer's behalf, for example
 * during a phone call. Every lookup and action here is written to the audit
 * log automatically by the server.
 */
export function AdminLookupPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [reference, setReference] = useState(searchParams.get('reference') ?? '');

  // Tagged by the reference (plus a nonce so re-submitting the same value
  // still triggers a fresh lookup) so "loading" is derived rather than
  // tracked with its own setState calls inside an effect.
  const [lookupKey, setLookupKey] = useState<string>(() => {
    const initial = searchParams.get('reference');
    return initial ? `${normaliseReference(initial)}#0` : '';
  });
  const [result, setResult] = useState<{ key: string; data?: AppointmentResponse; error?: string }>();
  const current = result?.key === lookupKey ? result : undefined;
  const data = current?.data;
  const loadError = current?.error;
  const loading = lookupKey !== '' && current === undefined;

  const [rescheduling, setRescheduling] = useState(false);
  const [newStartsAt, setNewStartsAt] = useState('');
  const [actionError, setActionError] = useState<string>();
  const [acting, setActing] = useState(false);

  useEffect(() => {
    if (!getAdminToken()) navigate('/admin/login', { replace: true });
  }, [navigate]);

  useEffect(() => {
    if (!lookupKey) return;
    const reference = lookupKey.split('#')[0] as string;
    let cancelled = false;
    api
      .adminLookupAppointment(reference)
      .then((response) => {
        if (!cancelled) setResult({ key: lookupKey, data: response });
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        if (e instanceof ApiError && e.status === 401) {
          clearAdminToken();
          navigate('/admin/login', { replace: true });
          return;
        }
        setResult({
          key: lookupKey,
          error: e instanceof ApiError && e.status === 404 ? `No booking found for ${reference}.` : 'Could not load that booking.',
        });
      });
    return () => {
      cancelled = true;
    };
  }, [lookupKey, navigate]);

  const submitLookup = (event: FormEvent) => {
    event.preventDefault();
    if (!reference.trim()) return;
    setActionError(undefined);
    setLookupKey((key) => `${normaliseReference(reference)}#${Number(key.split('#')[1] ?? 0) + 1}`);
  };

  const cancelOnBehalf = async () => {
    if (!data) return;
    setActing(true);
    setActionError(undefined);
    try {
      const updated = await api.adminCancelAppointment(data.appointment.reference);
      setResult({ key: lookupKey, data: updated });
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Could not cancel this booking.');
    } finally {
      setActing(false);
    }
  };

  const rescheduleOnBehalf = async (event: FormEvent) => {
    event.preventDefault();
    if (!data || !newStartsAt) return;
    setActing(true);
    setActionError(undefined);
    try {
      const updated = await api.adminRescheduleAppointment(data.appointment.reference, newStartsAt);
      setResult({ key: lookupKey, data: updated });
      setRescheduling(false);
      setNewStartsAt('');
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Could not reschedule this booking.');
    } finally {
      setActing(false);
    }
  };

  return (
    <div className="page">
      <StaffNav />
      <header className="page__head">
        <h1>Look up a booking</h1>
        <p className="lead">Pull up any customer's appointment by reference to help them over the phone or in person.</p>
      </header>

      <form className="card" onSubmit={submitLookup} style={{ marginBottom: 24 }}>
        <Field id="reference" label="Booking reference">
          {(props) => (
            <input
              {...props}
              className="input input--mono"
              placeholder="APT-7K3M9Q"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
            />
          )}
        </Field>
        <div className="step__actions">
          <button type="submit" className="button button--primary" disabled={loading}>
            {loading && <Spinner />}
            {loading ? 'Looking up' : 'Look up'}
          </button>
        </div>
      </form>

      {loadError && <Notice tone="error">{loadError}</Notice>}

      {data && (
        <div className="confirmation__layout">
          <Ticket
            reference={data.appointment.reference}
            status={data.appointment.status}
            service={data.appointment.service}
            branch={data.appointment.branch}
            slot={data.appointment}
            customerName={data.appointment.customer.name}
          />
          <div className="confirmation__side">
            <section className="card">
              <h2>Customer contact details</h2>
              <dl className="detail-list">
                <div>
                  <dt>Email</dt>
                  <dd>{data.appointment.customer.email}</dd>
                </div>
                <div>
                  <dt>Phone</dt>
                  <dd>{data.appointment.customer.phone}</dd>
                </div>
                {data.appointment.notes && (
                  <div>
                    <dt>Notes</dt>
                    <dd>{data.appointment.notes}</dd>
                  </div>
                )}
              </dl>
            </section>

            {data.appointment.status === 'CONFIRMED' && (
              <section className="card">
                <h2>Act on this booking</h2>
                {actionError && <Notice tone="error">{actionError}</Notice>}

                {rescheduling ? (
                  <form onSubmit={(e) => void rescheduleOnBehalf(e)}>
                    <Field id="admin-new-time" label="New date and time">
                      {(props) => (
                        <input
                          {...props}
                          type="datetime-local"
                          className="input"
                          value={newStartsAt}
                          onChange={(e) => setNewStartsAt(e.target.value)}
                        />
                      )}
                    </Field>
                    <div className="confirmation__actions">
                      <button type="submit" className="button button--primary" disabled={acting || !newStartsAt}>
                        {acting && <Spinner />}
                        Save new time
                      </button>
                      <button type="button" className="button button--ghost" onClick={() => setRescheduling(false)}>
                        Cancel
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="confirmation__actions">
                    <button type="button" className="button button--secondary" onClick={() => setRescheduling(true)}>
                      Reschedule
                    </button>
                    <button type="button" className="button button--danger" disabled={acting} onClick={() => void cancelOnBehalf()}>
                      {acting && <Spinner />}
                      Cancel booking
                    </button>
                  </div>
                )}
              </section>
            )}
          </div>
        </div>
      )}

      {!data && !loadError && !loading && <p className="muted">Enter a reference above. Every lookup is recorded in the audit log.</p>}
    </div>
  );
}

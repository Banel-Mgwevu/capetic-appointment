import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { MessageLog } from '../components/MessageLog';
import { Notice } from '../components/Notice';
import { Spinner } from '../components/Spinner';
import { Ticket } from '../components/Ticket';
import { api, ApiError } from '../lib/api';
import { clearAppointmentToken } from '../lib/session';
import type { AppointmentResponse } from '../lib/types';

/**
 * Landing page straight after booking. The booking result is passed through
 * router state so it renders instantly; if the page is reloaded or shared we
 * fall back to fetching by reference.
 */
export function ConfirmationPage() {
  const { reference = '' } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [data, setData] = useState<AppointmentResponse | undefined>(
    (location.state as AppointmentResponse | null)?.appointment?.reference === reference
      ? (location.state as AppointmentResponse)
      : undefined,
  );
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (data) return;
    let cancelled = false;
    api
      .appointment(reference)
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        if (e instanceof ApiError && e.status === 401) {
          clearAppointmentToken(reference);
          navigate(`/appointments?reference=${encodeURIComponent(reference)}`, { replace: true });
          return;
        }
        setError(e instanceof Error ? e.message : 'Could not load this appointment.');
      });
    return () => {
      cancelled = true;
    };
  }, [data, reference, navigate]);

  if (error) {
    return (
      <div className="page">
        <Notice tone="error">{error}</Notice>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="page page--loading">
        <Spinner />
        <p className="muted">Loading your confirmation…</p>
      </div>
    );
  }

  const { appointment, notifications } = data;

  return (
    <div className="page page--confirmation">
      <header className="confirmation__head">
        <p className="eyebrow">You're booked</p>
        <h1>See you at {appointment.branch.name}</h1>
        <p className="lead">
          Keep your reference handy. You can use it to look up or cancel this appointment at any time.
        </p>
      </header>

      <div className="confirmation__layout">
        <Ticket
          reference={appointment.reference}
          status={appointment.status}
          service={appointment.service}
          branch={appointment.branch}
          slot={appointment}
          customerName={appointment.customer.name}
        />
        <div className="confirmation__side">
          <section className="card">
            <h2>Before you arrive</h2>
            <ul className="checklist">
              <li>Arrive about 5 minutes early.</li>
              <li>Bring your ID document.</li>
              <li>Bring anything the service needs — for example proof of address for a new account.</li>
            </ul>
          </section>
          <div className="confirmation__actions">
            <Link className="button button--secondary" to={`/appointments/${appointment.reference}`}>
              Manage this appointment
            </Link>
            <Link className="button button--ghost" to="/">
              Book another
            </Link>
          </div>
        </div>
      </div>

      <MessageLog notifications={notifications} />
    </div>
  );
}

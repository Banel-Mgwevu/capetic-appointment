import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { MessageLog } from '../components/MessageLog';
import { Notice } from '../components/Notice';
import { Ticket } from '../components/Ticket';
import { api, ApiError } from '../lib/api';
import { clearAppointmentToken, getAppointmentToken } from '../lib/session';
import type { AppointmentResponse } from '../lib/types';

export function AppointmentPage() {
  const { reference = '' } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState<AppointmentResponse>();
  const [loadError, setLoadError] = useState<string>();
  const [confirming, setConfirming] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [actionError, setActionError] = useState<string>();
  const [justCancelled, setJustCancelled] = useState(false);

  useEffect(() => {
    if (!getAppointmentToken(reference)) {
      navigate(`/appointments?reference=${encodeURIComponent(reference)}`, { replace: true });
      return;
    }

    let cancelled = false;
    api
      .appointment(reference)
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        if (e instanceof ApiError && e.status === 401) {
          // Session expired or was for a different booking — send them back to verify again.
          clearAppointmentToken(reference);
          navigate(`/appointments?reference=${encodeURIComponent(reference)}`, { replace: true });
        } else if (e instanceof ApiError && (e.status === 404 || e.status === 400)) {
          setLoadError(`We couldn't find an appointment with reference ${reference}. Check the reference and try again.`);
        } else {
          setLoadError(e instanceof Error ? e.message : 'Could not load this appointment.');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [reference, navigate]);

  const cancelAppointment = async () => {
    setCancelling(true);
    setActionError(undefined);
    try {
      setData(await api.cancel(reference));
      setJustCancelled(true);
      setConfirming(false);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Could not cancel. Please try again.');
    } finally {
      setCancelling(false);
    }
  };

  if (loadError) {
    return (
      <div className="page page--narrow">
        <Notice tone="error">{loadError}</Notice>
        <p>
          <Link className="link" to="/appointments">
            Try another reference
          </Link>
        </p>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="page">
        <p className="muted">Loading appointment…</p>
      </div>
    );
  }

  const { appointment, notifications } = data;
  const isConfirmed = appointment.status === 'CONFIRMED';

  return (
    <div className="page page--confirmation">
      <header className="confirmation__head">
        <p className="eyebrow">Your appointment</p>
        <h1>{isConfirmed ? `Booked at ${appointment.branch.name}` : 'This appointment was cancelled'}</h1>
        {justCancelled && <Notice tone="success">Cancelled. The slot has been released and we've let you know by email and SMS.</Notice>}
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
          {isConfirmed ? (
            <section className="card">
              <h2>Can't make it?</h2>
              <p>Cancelling frees the slot for someone else. You can book a new time straight afterwards.</p>
              {actionError && <Notice tone="error">{actionError}</Notice>}
              {confirming ? (
                <div className="confirmation__actions">
                  <button type="button" className="button button--danger" disabled={cancelling} onClick={() => void cancelAppointment()}>
                    {cancelling ? 'Cancelling…' : 'Yes, cancel it'}
                  </button>
                  <button type="button" className="button button--ghost" disabled={cancelling} onClick={() => setConfirming(false)}>
                    Keep appointment
                  </button>
                </div>
              ) : (
                <div className="confirmation__actions">
                  <button type="button" className="button button--secondary" onClick={() => setConfirming(true)}>
                    Cancel appointment
                  </button>
                </div>
              )}
            </section>
          ) : (
            <section className="card">
              <h2>Need to come in?</h2>
              <p>Your original time has been released. Book a fresh slot whenever it suits you.</p>
              <div className="confirmation__actions">
                <Link className="button button--primary" to="/">
                  Book a new appointment
                </Link>
              </div>
            </section>
          )}
        </div>
      </div>

      <MessageLog notifications={notifications} />
    </div>
  );
}

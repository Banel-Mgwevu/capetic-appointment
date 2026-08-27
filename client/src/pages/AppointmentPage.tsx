import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Notice } from '../components/Notice';
import { SlotGrid } from '../components/SlotGrid';
import { Spinner } from '../components/Spinner';
import { Ticket } from '../components/Ticket';
import { api, ApiError } from '../lib/api';
import { addDays, formatLongDate, todayAt } from '../lib/dates';
import { clearAppointmentToken, getAppointmentToken } from '../lib/session';
import type { AppointmentResponse, DayAvailability, Slot } from '../lib/types';

const HORIZON_DAYS = 30;

export function AppointmentPage() {
  const { reference = '' } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState<AppointmentResponse>();
  const [loadError, setLoadError] = useState<string>();
  const [confirming, setConfirming] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [actionError, setActionError] = useState<string>();
  const [justCancelled, setJustCancelled] = useState(false);

  const [rescheduling, setRescheduling] = useState(false);
  const [newDate, setNewDate] = useState<string>();
  const [newSlot, setNewSlot] = useState<Slot>();
  // Tagged by the request it answers, so "loading" is derived (result is
  // stale) rather than tracked with its own setState calls inside the effect.
  const availabilityKey =
    rescheduling && data && newDate ? `${data.appointment.branch.id}:${data.appointment.service.id}:${newDate}` : undefined;
  const [availabilityResult, setAvailabilityResult] = useState<{ key: string; day?: DayAvailability; error?: string }>();
  const currentAvailability = availabilityResult?.key === availabilityKey ? availabilityResult : undefined;
  const availability = currentAvailability?.day;
  const availabilityError = currentAvailability?.error;

  useEffect(() => {
    if (!availabilityKey || !data || !newDate) return;
    let cancelled = false;
    api
      .availability(data.appointment.branch.id, data.appointment.service.id, newDate)
      .then((day) => {
        if (!cancelled) setAvailabilityResult({ key: availabilityKey, day });
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setAvailabilityResult({ key: availabilityKey, error: e instanceof Error ? e.message : 'Could not load times.' });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [availabilityKey, data, newDate]);

  const [savingReschedule, setSavingReschedule] = useState(false);

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
          // Session expired or was for a different booking, so send them back to verify again.
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

  const startReschedule = () => {
    if (!data) return;
    setRescheduling(true);
    setNewDate(data.appointment.startsAt.slice(0, 10));
    setNewSlot(undefined);
    setActionError(undefined);
  };

  const saveReschedule = async () => {
    if (!newSlot) return;
    setSavingReschedule(true);
    setActionError(undefined);
    try {
      setData(await api.reschedule(reference, newSlot.startsAt));
      setRescheduling(false);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Could not reschedule. Please try again.');
    } finally {
      setSavingReschedule(false);
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
      <div className="page page--loading">
        <Spinner />
        <p className="muted">Loading appointment…</p>
      </div>
    );
  }

  const { appointment } = data;
  const isConfirmed = appointment.status === 'CONFIRMED';
  const today = todayAt(appointment.branch.timezone);
  const lastBookableDate = addDays(today, HORIZON_DAYS);

  return (
    <div className="page page--confirmation">
      <header className="confirmation__head">
        <p className="eyebrow">Your appointment</p>
        <h1>{isConfirmed ? `Booked at ${appointment.branch.name}` : 'This appointment was cancelled'}</h1>
        {justCancelled && <Notice tone="success">Cancelled. The slot has been released and we've let you know by email and SMS.</Notice>}
        {appointment.rescheduleCount > 0 && (
          <Notice tone="info">
            This appointment has been moved {appointment.rescheduleCount} time{appointment.rescheduleCount === 1 ? '' : 's'}.
          </Notice>
        )}
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
            <>
              {actionError && <Notice tone="error">{actionError}</Notice>}

              {rescheduling ? (
                <section className="card">
                  <h2>Choose a new time</h2>
                  <p className="muted">Same branch and service, at {formatLongDate(appointment.startsAt)} currently.</p>
                  <div className="field">
                    <label htmlFor="reschedule-date" className="field__label">
                      Date
                    </label>
                    <input
                      id="reschedule-date"
                      type="date"
                      className="input input--date"
                      value={newDate}
                      min={today}
                      max={lastBookableDate}
                      onChange={(e) => {
                        setNewDate(e.target.value);
                        setNewSlot(undefined);
                      }}
                    />
                  </div>
                  {availabilityError ? (
                    <Notice tone="error">{availabilityError}</Notice>
                  ) : !availability || availability.date !== newDate ? (
                    <p className="muted">Checking availability…</p>
                  ) : availability.slots.every((s) => !s.available) ? (
                    <Notice tone="info">No times left on this day. Try another date.</Notice>
                  ) : (
                    <SlotGrid slots={availability.slots} selected={newSlot?.startsAt} onSelect={setNewSlot} />
                  )}
                  <div className="confirmation__actions" style={{ marginTop: 16 }}>
                    <button
                      type="button"
                      className="button button--primary"
                      disabled={!newSlot || savingReschedule}
                      onClick={() => void saveReschedule()}
                    >
                      {savingReschedule && <Spinner />}
                      Confirm new time
                    </button>
                    <button type="button" className="button button--ghost" disabled={savingReschedule} onClick={() => setRescheduling(false)}>
                      Cancel
                    </button>
                  </div>
                </section>
              ) : (
                <section className="card">
                  <h2>Need a different time?</h2>
                  <p>Move this appointment to another day or time at the same branch.</p>
                  <div className="confirmation__actions">
                    <button type="button" className="button button--secondary" onClick={startReschedule}>
                      Reschedule
                    </button>
                  </div>
                </section>
              )}

              {!rescheduling && (
                <section className="card">
                  <h2>Can't make it?</h2>
                  <p>Cancelling frees the slot for someone else. You can book a new time straight afterwards.</p>
                  {confirming ? (
                    <div className="confirmation__actions">
                      <button type="button" className="button button--danger" disabled={cancelling} onClick={() => void cancelAppointment()}>
                        {cancelling && <Spinner />}
                        {cancelling ? 'Cancelling' : 'Yes, cancel it'}
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
              )}
            </>
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
    </div>
  );
}

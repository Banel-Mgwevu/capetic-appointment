import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Field } from '../components/Field';
import { Notice } from '../components/Notice';
import { Spinner } from '../components/Spinner';
import { api, ApiError } from '../lib/api';
import { formatShortDate, formatTime } from '../lib/dates';
import { getContactToken, storeAppointmentToken, storeContactToken } from '../lib/session';
import type { AppointmentSummary } from '../lib/types';

type Step = 'request' | 'verify' | 'list';

/**
 * An email address or phone number isn't a secret the way a booking
 * reference is, so seeing every booking tied to one requires proving control
 * of it first, via a one-time code, rather than just typing it in.
 */
export function MyAppointmentsPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>(getContactToken() ? 'list' : 'request');
  const [contact, setContact] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);
  const [appointments, setAppointments] = useState<AppointmentSummary[]>();
  const [viewingRef, setViewingRef] = useState<string>();

  const requestCode = async (event: FormEvent) => {
    event.preventDefault();
    if (contact.trim().length < 3) {
      setError('Enter the email or phone number you booked with.');
      return;
    }
    setSubmitting(true);
    setError(undefined);
    try {
      await api.requestOtp(contact.trim());
      setStep('verify');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send a code. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const verifyCode = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(undefined);
    try {
      const grant = await api.verifyOtp(contact.trim(), code.trim());
      storeContactToken(grant.token);
      const list = await api.myAppointments();
      setAppointments(list);
      setStep('list');
    } catch (e) {
      setError(e instanceof ApiError && e.code === 'CODE_INVALID' ? e.message : 'Could not verify that code.');
    } finally {
      setSubmitting(false);
    }
  };

  if (step === 'list' && !appointments) {
    api
      .myAppointments()
      .then(setAppointments)
      .catch(() => setStep('request'));
  }

  const view = async (reference: string) => {
    setViewingRef(reference);
    setError(undefined);
    try {
      const grant = await api.bookingAccessFromContactSession(reference);
      storeAppointmentToken(reference, grant.token);
      navigate(`/appointments/${reference}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open that booking.');
      setViewingRef(undefined);
    }
  };

  return (
    <div className="page page--narrow">
      <header className="page__head">
        <h1>My appointments</h1>
        <p className="lead">
          {step === 'request' && "See every appointment linked to your email or mobile number."}
          {step === 'verify' && `Enter the code we sent to ${contact}.`}
          {step === 'list' && 'All appointments linked to your details.'}
        </p>
      </header>

      {error && <Notice tone="error">{error}</Notice>}

      {step === 'request' && (
        <form className="card" onSubmit={(e) => void requestCode(e)} noValidate>
          <Field id="my-contact" label="Email or mobile number">
            {(props) => (
              <input
                {...props}
                className="input"
                placeholder="you@example.com or 082 555 0123"
                value={contact}
                onChange={(e) => setContact(e.target.value)}
              />
            )}
          </Field>
          <div className="step__actions">
            <button type="submit" className="button button--primary" disabled={submitting}>
              {submitting && <Spinner />}
              {submitting ? 'Sending' : 'Send me a code'}
            </button>
          </div>
        </form>
      )}

      {step === 'verify' && (
        <form className="card" onSubmit={(e) => void verifyCode(e)} noValidate>
          <Field id="my-code" label="6-digit code" hint="Codes expire after 5 minutes.">
            {(props) => (
              <input
                {...props}
                className="input input--mono"
                inputMode="numeric"
                maxLength={6}
                autoComplete="one-time-code"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              />
            )}
          </Field>
          <div className="step__actions">
            <button type="submit" className="button button--primary" disabled={submitting || code.length !== 6}>
              {submitting && <Spinner />}
              {submitting ? 'Verifying' : 'Verify'}
            </button>
            <button type="button" className="button button--ghost" onClick={() => setStep('request')} disabled={submitting}>
              Use a different contact
            </button>
          </div>
        </form>
      )}

      {step === 'list' && (
        <div className="card">
          {!appointments ? (
            <p className="muted">Loading…</p>
          ) : appointments.length === 0 ? (
            <p className="muted">No appointments found for that contact.</p>
          ) : (
            <ul className="my-appointments-list">
              {appointments.map((a) => (
                <li key={a.reference} className={`my-appointments-list__item my-appointments-list__item--${a.status.toLowerCase()}`}>
                  <div>
                    <span className="my-appointments-list__service">{a.serviceName}</span>
                    <span className="my-appointments-list__meta">
                      {a.branchName} · {formatShortDate(a.startsAt)} at {formatTime(a.startsAt)}
                    </span>
                  </div>
                  <span className="my-appointments-list__status">{a.status === 'CONFIRMED' ? 'Confirmed' : 'Cancelled'}</span>
                  <button type="button" className="link" disabled={viewingRef === a.reference} onClick={() => void view(a.reference)}>
                    {viewingRef === a.reference ? 'Opening…' : 'View'}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="step__actions">
            <Link className="button button--ghost" to="/">
              Book another
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

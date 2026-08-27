import { useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Field } from '../components/Field';
import { Notice } from '../components/Notice';
import { Spinner } from '../components/Spinner';
import { api, ApiError } from '../lib/api';
import { storeAppointmentToken } from '../lib/session';

/**
 * A lightweight "sign in" for a booking: proving you know the reference *and*
 * the email or phone on file, rather than a full customer account system.
 */
export function FindBookingPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [reference, setReference] = useState(searchParams.get('reference') ?? '');
  const [contact, setContact] = useState('');
  const [errors, setErrors] = useState<{ reference?: string; contact?: string }>({});
  const [formError, setFormError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setFormError(undefined);

    const cleaned = reference.trim().toUpperCase().replace(/\s+/g, '');
    const withPrefix = cleaned.startsWith('APT-') ? cleaned : `APT-${cleaned}`;
    const nextErrors: typeof errors = {};
    if (!/^APT-[A-Z0-9]{6}$/.test(withPrefix)) nextErrors.reference = 'References look like APT-7K3M9Q (six letters and numbers).';
    if (contact.trim().length < 3) nextErrors.contact = 'Enter the email or phone number used to book.';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSubmitting(true);
    try {
      const access = await api.accessAppointment(withPrefix, contact.trim());
      storeAppointmentToken(withPrefix, access.token);
      navigate(`/appointments/${withPrefix}`);
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        setErrors({ reference: `We couldn't find a booking with reference ${withPrefix}.` });
      } else if (error instanceof ApiError && error.code === 'VERIFICATION_FAILED') {
        setErrors({ contact: 'That email or phone number does not match this booking.' });
      } else {
        setFormError(error instanceof Error ? error.message : 'Something went wrong. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="page page--narrow">
      <header className="page__head">
        <h1>Find your appointment</h1>
        <p className="lead">
          Enter your booking reference and the email or mobile number you booked with. This confirms it's your
          appointment before showing any details.
        </p>
      </header>
      <form onSubmit={(e) => void submit(e)} noValidate className="card">
        {formError && <Notice tone="error">{formError}</Notice>}
        <Field id="reference" label="Booking reference" error={errors.reference}>
          {(props) => (
            <input
              {...props}
              className="input input--mono"
              placeholder="APT-7K3M9Q"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              value={reference}
              onChange={(e) => {
                setReference(e.target.value);
                setErrors((prev) => ({ ...prev, reference: undefined }));
              }}
            />
          )}
        </Field>
        <Field id="contact" label="Email or mobile number" hint="Whatever you gave when you booked." error={errors.contact}>
          {(props) => (
            <input
              {...props}
              className="input"
              autoComplete="off"
              placeholder="you@example.com or 082 555 0123"
              value={contact}
              onChange={(e) => {
                setContact(e.target.value);
                setErrors((prev) => ({ ...prev, contact: undefined }));
              }}
            />
          )}
        </Field>
        <div className="step__actions">
          <button type="submit" className="button button--primary" disabled={submitting}>
            {submitting && <Spinner />}
            {submitting ? 'Checking' : 'View my appointment'}
          </button>
        </div>
      </form>
    </div>
  );
}

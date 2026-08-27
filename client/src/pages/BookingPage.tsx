import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Field } from '../components/Field';
import { Notice } from '../components/Notice';
import { SlotGrid } from '../components/SlotGrid';
import { Stepper, type StepDefinition } from '../components/Stepper';
import { Ticket } from '../components/Ticket';
import { api, ApiError } from '../lib/api';
import { storeAppointmentToken } from '../lib/session';
import { addDays, describeHours, formatLongDate, isOpenOn, nextOpenDate, todayAt } from '../lib/dates';
import type { Branch, CustomerInput, DayAvailability, Service, Slot } from '../lib/types';
import { validateCustomer } from '../lib/validation';

const STEPS: StepDefinition[] = [
  { key: 'service', label: 'Service' },
  { key: 'branch', label: 'Branch' },
  { key: 'time', label: 'Date & time' },
  { key: 'details', label: 'Your details' },
];
const STEP_INDEX = { service: 0, branch: 1, time: 2, details: 3 } as const;
const HORIZON_DAYS = 30;

const EMPTY_CUSTOMER: CustomerInput = { name: '', email: '', phone: '', idNumber: '' };

export function BookingPage() {
  const navigate = useNavigate();

  // Reference data
  const [services, setServices] = useState<Service[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loadError, setLoadError] = useState<string>();

  // Draft booking
  const [step, setStep] = useState(0);
  const [reachable, setReachable] = useState(0);
  const [service, setService] = useState<Service>();
  const [branch, setBranch] = useState<Branch>();
  const [branchQuery, setBranchQuery] = useState('');
  const [date, setDate] = useState<string>();
  const [slot, setSlot] = useState<Slot>();
  const [customer, setCustomer] = useState<CustomerInput>(EMPTY_CUSTOMER);
  const [notes, setNotes] = useState('');

  // Availability for the chosen day. The result is tagged with the request it
  // answers, so "loading" is derived (result is stale) rather than tracked.
  const [refreshKey, setRefreshKey] = useState(0);
  const availabilityKey = branch && service && date ? `${branch.id}:${service.id}:${date}:${refreshKey}` : undefined;
  const [availabilityResult, setAvailabilityResult] = useState<{ key: string; day?: DayAvailability; error?: string }>();
  const currentResult = availabilityResult?.key === availabilityKey ? availabilityResult : undefined;
  const availability = currentResult?.day;
  const availabilityError = currentResult?.error;
  const availabilityLoading = availabilityKey !== undefined && currentResult === undefined;

  // Submission
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([api.services(), api.branches()])
      .then(([s, b]) => {
        if (cancelled) return;
        setServices(s);
        setBranches(b);
      })
      .catch((error: unknown) => {
        if (!cancelled) setLoadError(error instanceof Error ? error.message : 'Could not load booking options.');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!availabilityKey || !branch || !service || !date) return;
    let cancelled = false;
    api
      .availability(branch.id, service.id, date)
      .then((day) => {
        if (!cancelled) setAvailabilityResult({ key: availabilityKey, day });
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setAvailabilityResult({
            key: availabilityKey,
            error: error instanceof Error ? error.message : 'Could not load times.',
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [availabilityKey, branch, service, date]);

  const filteredBranches = useMemo(() => {
    const query = branchQuery.trim().toLowerCase();
    if (!query) return branches;
    return branches.filter((b) =>
      [b.name, b.city, b.address].some((field) => field.toLowerCase().includes(query)),
    );
  }, [branches, branchQuery]);

  const today = useMemo(() => todayAt(branch?.timezone ?? 'Africa/Johannesburg'), [branch]);
  const lastBookableDate = useMemo(() => addDays(today, HORIZON_DAYS), [today]);

  const goTo = useCallback((index: number) => {
    setStep(index);
    setSubmitError(undefined);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const advance = useCallback(
    (from: number) => {
      setReachable((r) => Math.max(r, from + 1));
      goTo(from + 1);
    },
    [goTo],
  );

  const chooseService = (next: Service) => {
    if (next.id !== service?.id) {
      setService(next);
      setSlot(undefined);
    }
    advance(STEP_INDEX.service);
  };

  const chooseBranch = (next: Branch) => {
    if (next.id !== branch?.id) {
      setBranch(next);
      setSlot(undefined);
      setDate(nextOpenDate(next, todayAt(next.timezone)));
    }
    advance(STEP_INDEX.branch);
  };

  const changeDate = (next: string) => {
    setDate(next);
    setSlot(undefined);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!service || !branch || !slot) return;

    const errors = validateCustomer(customer);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSubmitting(true);
    setSubmitError(undefined);
    try {
      const result = await api.book({
        branchId: branch.id,
        serviceId: service.id,
        startsAt: slot.startsAt,
        customer: {
          name: customer.name.trim(),
          email: customer.email.trim(),
          phone: customer.phone.trim(),
          ...(customer.idNumber?.trim() ? { idNumber: customer.idNumber.trim() } : {}),
        },
        ...(notes.trim() ? { notes: notes.trim() } : {}),
      });
      if (result.access) storeAppointmentToken(result.appointment.reference, result.access.token);
      navigate(`/confirmation/${result.appointment.reference}`, { state: result, replace: false });
    } catch (error) {
      if (error instanceof ApiError && error.code === 'SLOT_UNAVAILABLE') {
        setSlot(undefined);
        setRefreshKey((k) => k + 1);
        setSubmitError(error.message);
        goTo(STEP_INDEX.time);
      } else if (error instanceof ApiError && error.status === 400 && error.details.length > 0) {
        const mapped = Object.fromEntries(
          Object.entries(error.fieldErrors).map(([path, message]) => [path.replace(/^customer\./, ''), message]),
        );
        setFieldErrors(mapped);
        setSubmitError('Please check the highlighted fields.');
      } else {
        setSubmitError(error instanceof Error ? error.message : 'Booking failed. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (loadError) {
    return (
      <div className="page">
        <Notice tone="error">
          {loadError}{' '}
          <button type="button" className="link" onClick={() => window.location.reload()}>
            Reload
          </button>
        </Notice>
      </div>
    );
  }

  return (
    <div className="page page--booking">
      <div className="booking">
        <div className="booking__main">
          <Stepper steps={STEPS} current={step} reachable={reachable} onSelect={goTo} />

          {submitError && <Notice tone="error">{submitError}</Notice>}

          {step === STEP_INDEX.service && (
            <section className="step" aria-labelledby="step-service">
              <h1 id="step-service" className="step__title">
                What do you need help with?
              </h1>
              {services.length === 0 ? (
                <p className="muted">Loading services…</p>
              ) : (
                <ul className="choices">
                  {services.map((s) => (
                    <li key={s.id}>
                      <button
                        type="button"
                        className={`choice ${s.id === service?.id ? 'choice--selected' : ''}`}
                        aria-pressed={s.id === service?.id}
                        onClick={() => chooseService(s)}
                      >
                        <span className="choice__title">{s.name}</span>
                        <span className="choice__body">{s.description}</span>
                        <span className="choice__meta">About {s.durationMinutes} minutes</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {step === STEP_INDEX.branch && (
            <section className="step" aria-labelledby="step-branch">
              <h1 id="step-branch" className="step__title">
                Which branch suits you?
              </h1>
              <div className="search">
                <svg className="search__icon" aria-hidden="true" viewBox="0 0 20 20" fill="none">
                  <circle cx="9" cy="9" r="6.5" stroke="currentColor" strokeWidth="1.6" />
                  <path d="M14 14L18 18" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
                <input
                  type="search"
                  className="search__input"
                  placeholder="Search by branch name, suburb or city"
                  aria-label="Search branches"
                  value={branchQuery}
                  onChange={(e) => setBranchQuery(e.target.value)}
                />
              </div>
              {branches.length > 0 && filteredBranches.length === 0 ? (
                <p className="muted">No branches match "{branchQuery}". Try a different suburb or city.</p>
              ) : (
                <ul className="choices">
                  {filteredBranches.map((b) => (
                    <li key={b.id}>
                      <button
                        type="button"
                        className={`choice ${b.id === branch?.id ? 'choice--selected' : ''}`}
                        aria-pressed={b.id === branch?.id}
                        onClick={() => chooseBranch(b)}
                      >
                        <span className="choice__title">
                          {b.name} <span className="choice__city">{b.city}</span>
                        </span>
                        <span className="choice__body">{b.address}</span>
                        <span className="choice__meta">{describeHours(b)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {step === STEP_INDEX.time && branch && service && date && (
            <section className="step" aria-labelledby="step-time">
              <h1 id="step-time" className="step__title">
                Pick a day and time
              </h1>
              <Field id="date" label="Date" hint={`${branch.name} · ${describeHours(branch)}`}>
                {(props) => (
                  <input
                    {...props}
                    type="date"
                    className="input input--date"
                    value={date}
                    min={today}
                    max={lastBookableDate}
                    onChange={(e) => e.target.value && changeDate(e.target.value)}
                  />
                )}
              </Field>

              <div className="step__body" aria-live="polite">
                {!isOpenOn(branch, date) ? (
                  <Notice tone="info">
                    {branch.name} is closed on {formatLongDate(date).split(' ')[0]}s.{' '}
                    <button type="button" className="link" onClick={() => changeDate(nextOpenDate(branch, addDays(date, 1)))}>
                      Try {formatLongDate(nextOpenDate(branch, addDays(date, 1)))}
                    </button>
                  </Notice>
                ) : availabilityError ? (
                  <Notice tone="error">
                    {availabilityError}{' '}
                    <button type="button" className="link" onClick={() => setRefreshKey((k) => k + 1)}>
                      Try again
                    </button>
                  </Notice>
                ) : availabilityLoading || !availability ? (
                  <p className="muted">Checking availability…</p>
                ) : availability.slots.every((s) => !s.available) ? (
                  <Notice tone="info">
                    No times left on {formatLongDate(date)}.{' '}
                    <button type="button" className="link" onClick={() => changeDate(nextOpenDate(branch, addDays(date, 1)))}>
                      Try {formatLongDate(nextOpenDate(branch, addDays(date, 1)))}
                    </button>
                  </Notice>
                ) : (
                  <SlotGrid slots={availability.slots} selected={slot?.startsAt} onSelect={setSlot} />
                )}
              </div>

              <div className="step__actions">
                <button type="button" className="button button--primary" disabled={!slot} onClick={() => advance(STEP_INDEX.time)}>
                  Continue
                </button>
              </div>
            </section>
          )}

          {step === STEP_INDEX.details && (
            <form className="step" aria-labelledby="step-details" onSubmit={(e) => void submit(e)} noValidate>
              <h1 id="step-details" className="step__title">
                Who is the appointment for?
              </h1>

              <Field id="name" label="Full name" error={fieldErrors.name}>
                {(props) => (
                  <input
                    {...props}
                    className="input"
                    autoComplete="name"
                    value={customer.name}
                    onChange={(e) => setCustomer({ ...customer, name: e.target.value })}
                  />
                )}
              </Field>
              <Field id="email" label="Email" hint="We'll send your confirmation here." error={fieldErrors.email}>
                {(props) => (
                  <input
                    {...props}
                    type="email"
                    className="input"
                    autoComplete="email"
                    inputMode="email"
                    value={customer.email}
                    onChange={(e) => setCustomer({ ...customer, email: e.target.value })}
                  />
                )}
              </Field>
              <Field id="phone" label="Mobile number" hint="We'll SMS a reminder to this number." error={fieldErrors.phone}>
                {(props) => (
                  <input
                    {...props}
                    type="tel"
                    className="input"
                    autoComplete="tel"
                    inputMode="tel"
                    placeholder="082 555 0123"
                    value={customer.phone}
                    onChange={(e) => setCustomer({ ...customer, phone: e.target.value })}
                  />
                )}
              </Field>
              <Field
                id="idNumber"
                label="South African ID number"
                hint="Helps the branch have your details ready. Not shown on your confirmation."
                error={fieldErrors.idNumber}
                optional
              >
                {(props) => (
                  <input
                    {...props}
                    className="input"
                    inputMode="numeric"
                    maxLength={13}
                    value={customer.idNumber ?? ''}
                    onChange={(e) => setCustomer({ ...customer, idNumber: e.target.value.replace(/\D/g, '') })}
                  />
                )}
              </Field>
              <Field id="notes" label="Anything the branch should know?" error={fieldErrors.notes} optional>
                {(props) => (
                  <textarea
                    {...props}
                    className="input input--textarea"
                    rows={3}
                    maxLength={500}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                )}
              </Field>

              <div className="step__actions">
                <button type="submit" className="button button--primary" disabled={submitting}>
                  {submitting ? 'Confirming…' : 'Confirm appointment'}
                </button>
              </div>
            </form>
          )}
        </div>

        <div className="booking__aside">
          <Ticket
            service={service}
            branch={branch}
            slot={slot}
            customerName={step === STEP_INDEX.details && customer.name.trim() ? customer.name.trim() : undefined}
            onEdit={(key) => goTo(STEP_INDEX[key])}
          />
        </div>
      </div>
    </div>
  );
}

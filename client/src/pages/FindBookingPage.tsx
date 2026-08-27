import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Field } from '../components/Field';

export function FindBookingPage() {
  const navigate = useNavigate();
  const [reference, setReference] = useState('');
  const [error, setError] = useState<string>();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const cleaned = reference.trim().toUpperCase().replace(/\s+/g, '');
    const withPrefix = cleaned.startsWith('APT-') ? cleaned : `APT-${cleaned}`;
    if (!/^APT-[A-Z0-9]{6}$/.test(withPrefix)) {
      setError('References look like APT-7K3M9Q — six letters and numbers.');
      return;
    }
    navigate(`/appointments/${withPrefix}`);
  };

  return (
    <div className="page page--narrow">
      <header className="page__head">
        <h1>Find your appointment</h1>
        <p className="lead">Enter the reference from your confirmation email or SMS.</p>
      </header>
      <form onSubmit={submit} noValidate className="card">
        <Field id="reference" label="Booking reference" error={error}>
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
                setError(undefined);
              }}
            />
          )}
        </Field>
        <div className="step__actions">
          <button type="submit" className="button button--primary">
            Look up
          </button>
        </div>
      </form>
    </div>
  );
}

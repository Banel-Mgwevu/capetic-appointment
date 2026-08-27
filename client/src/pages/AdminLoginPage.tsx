import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Field } from '../components/Field';
import { Notice } from '../components/Notice';
import { Spinner } from '../components/Spinner';
import { api, ApiError } from '../lib/api';
import { storeAdminToken } from '../lib/session';

export function AdminLoginPage() {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(undefined);
    try {
      const { token } = await api.adminLogin(username.trim(), password);
      storeAdminToken(token);
      navigate('/admin/analytics');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not sign in. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="page page--narrow">
      <header className="page__head">
        <p className="eyebrow">Staff only</p>
        <h1>Admin sign-in</h1>
        <p className="lead">View branch performance and booking trends.</p>
      </header>
      <form onSubmit={(e) => void submit(e)} noValidate className="card">
        {error && <Notice tone="error">{error}</Notice>}
        <Field id="username" label="Username">
          {(props) => (
            <input {...props} className="input" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} />
          )}
        </Field>
        <Field id="password" label="Password">
          {(props) => (
            <input
              {...props}
              type="password"
              className="input"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          )}
        </Field>
        <div className="step__actions">
          <button type="submit" className="button button--primary" disabled={submitting}>
            {submitting && <Spinner />}
            {submitting ? 'Signing in' : 'Sign in'}
          </button>
        </div>
      </form>
    </div>
  );
}

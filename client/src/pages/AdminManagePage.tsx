import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Notice } from '../components/Notice';
import { OpeningHoursEditor } from '../components/OpeningHoursEditor';
import { Spinner } from '../components/Spinner';
import { StaffNav } from '../components/StaffNav';
import { api, ApiError } from '../lib/api';
import { describeHours } from '../lib/dates';
import { getAdminToken } from '../lib/session';
import type { Branch, BranchInput, Service, ServiceInput } from '../lib/types';

const DEFAULT_HOURS: BranchInput['openingHours'] = {
  '1': { open: '08:30', close: '16:30' },
  '2': { open: '08:30', close: '16:30' },
  '3': { open: '08:30', close: '16:30' },
  '4': { open: '08:30', close: '16:30' },
  '5': { open: '08:30', close: '16:30' },
};

const EMPTY_BRANCH: BranchInput = {
  name: '',
  city: '',
  address: '',
  slotMinutes: 30,
  capacity: 1,
  openingHours: DEFAULT_HOURS,
};

const EMPTY_SERVICE: ServiceInput = { name: '', description: '', durationMinutes: 30 };

/** HTML ids can't contain spaces; form titles like "Edit Sandton City" need a safe id prefix. */
function idSafe(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

/**
 * Branches and services otherwise only exist as seed data with no admin UI,
 * meaning a new branch or a change in opening hours would need a code
 * change and redeploy. This lets staff do it through the app instead.
 */
export function AdminManagePage() {
  const navigate = useNavigate();
  const [branches, setBranches] = useState<Branch[]>();
  const [services, setServices] = useState<Service[]>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!getAdminToken()) {
      navigate('/admin/login', { replace: true });
      return;
    }
    Promise.all([api.branches(), api.services()])
      .then(([b, s]) => {
        setBranches(b);
        setServices(s);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Could not load branches and services.'));
  }, [navigate]);

  const reload = async () => {
    const [b, s] = await Promise.all([api.branches(), api.services()]);
    setBranches(b);
    setServices(s);
  };

  if (error) {
    return (
      <div className="page">
        <StaffNav />
        <Notice tone="error">{error}</Notice>
      </div>
    );
  }
  if (!branches || !services) {
    return (
      <div className="page page--loading">
        <Spinner />
        <p className="muted">Loading…</p>
      </div>
    );
  }

  return (
    <div className="page">
      <StaffNav />
      <header className="page__head">
        <h1>Manage branches and services</h1>
        <p className="lead">Changes take effect immediately for new bookings and are recorded in the audit log.</p>
      </header>

      <section style={{ marginBottom: 40 }}>
        <h2>Branches</h2>
        <div className="manage-list">
          {branches.map((branch) => (
            <BranchCard key={branch.id} branch={branch} onSaved={() => void reload()} />
          ))}
        </div>
        <BranchForm title="Add a branch" onSubmit={async (input) => { await api.createBranch(input); await reload(); }} />
      </section>

      <section>
        <h2>Services</h2>
        <div className="manage-list">
          {services.map((service) => (
            <ServiceCard key={service.id} service={service} onSaved={() => void reload()} />
          ))}
        </div>
        <ServiceForm title="Add a service" onSubmit={async (input) => { await api.createService(input); await reload(); }} />
      </section>
    </div>
  );
}

function BranchCard({ branch, onSaved }: { branch: Branch; onSaved: () => void }) {
  const [editing, setEditing] = useState(false);
  if (!editing) {
    return (
      <div className="manage-card">
        <div className="manage-card__summary">
          <span className="manage-card__title">
            {branch.name} <span className="manage-card__meta">{branch.city}</span>
          </span>
          <span className="manage-card__detail">{branch.address}</span>
          <span className="manage-card__detail">
            Capacity {branch.capacity} · {branch.slotMinutes}-min slots · {describeHours(branch)}
          </span>
        </div>
        <button type="button" className="button button--ghost button--small" onClick={() => setEditing(true)}>
          Edit
        </button>
      </div>
    );
  }
  return (
    <BranchForm
      title={`Edit ${branch.name}`}
      initial={branch}
      onCancel={() => setEditing(false)}
      onSubmit={async (input) => {
        await api.updateBranch(branch.id, input);
        setEditing(false);
        onSaved();
      }}
    />
  );
}

function ServiceCard({ service, onSaved }: { service: Service; onSaved: () => void }) {
  const [editing, setEditing] = useState(false);
  if (!editing) {
    return (
      <div className="manage-card">
        <div className="manage-card__summary">
          <span className="manage-card__title">{service.name}</span>
          <span className="manage-card__detail">{service.description}</span>
          <span className="manage-card__detail">{service.durationMinutes} minutes</span>
        </div>
        <button type="button" className="button button--ghost button--small" onClick={() => setEditing(true)}>
          Edit
        </button>
      </div>
    );
  }
  return (
    <ServiceForm
      title={`Edit ${service.name}`}
      initial={service}
      onCancel={() => setEditing(false)}
      onSubmit={async (input) => {
        await api.updateService(service.id, input);
        setEditing(false);
        onSaved();
      }}
    />
  );
}

interface BranchFormProps {
  title: string;
  initial?: BranchInput;
  onCancel?: () => void;
  onSubmit: (input: BranchInput) => Promise<void>;
}

function BranchForm({ title, initial, onCancel, onSubmit }: BranchFormProps) {
  const idPrefix = idSafe(title);
  const [form, setForm] = useState<BranchInput>(initial ?? EMPTY_BRANCH);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(undefined);
    try {
      await onSubmit(form);
      if (!initial) setForm(EMPTY_BRANCH); // clear the "add" form after a successful create
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not save this branch.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className="card manage-form" onSubmit={(e) => void submit(e)}>
      <h3>{title}</h3>
      {error && <Notice tone="error">{error}</Notice>}
      <div className="manage-form__grid">
        <div className="field">
          <label className="field__label" htmlFor={`name-${idPrefix}`}>
            Name
          </label>
          <input
            id={`name-${idPrefix}`}
            className="input"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
          />
        </div>
        <div className="field">
          <label className="field__label" htmlFor={`city-${idPrefix}`}>
            City
          </label>
          <input
            id={`city-${idPrefix}`}
            className="input"
            value={form.city}
            onChange={(e) => setForm({ ...form, city: e.target.value })}
            required
          />
        </div>
        <div className="field manage-form__span2">
          <label className="field__label" htmlFor={`address-${idPrefix}`}>
            Address
          </label>
          <input
            id={`address-${idPrefix}`}
            className="input"
            value={form.address}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
            required
          />
        </div>
        <div className="field">
          <label className="field__label" htmlFor={`capacity-${idPrefix}`}>
            Capacity (consultants)
          </label>
          <input
            id={`capacity-${idPrefix}`}
            className="input"
            type="number"
            min={1}
            max={50}
            value={form.capacity}
            onChange={(e) => setForm({ ...form, capacity: Number(e.target.value) })}
            required
          />
        </div>
        <div className="field">
          <label className="field__label" htmlFor={`slot-${idPrefix}`}>
            Slot length (minutes)
          </label>
          <input
            id={`slot-${idPrefix}`}
            className="input"
            type="number"
            min={5}
            max={240}
            step={5}
            value={form.slotMinutes}
            onChange={(e) => setForm({ ...form, slotMinutes: Number(e.target.value) })}
            required
          />
        </div>
      </div>
      <OpeningHoursEditor value={form.openingHours} onChange={(openingHours) => setForm({ ...form, openingHours })} />
      <div className="step__actions">
        <button type="submit" className="button button--primary" disabled={submitting}>
          {submitting && <Spinner />}
          {initial ? 'Save changes' : 'Add branch'}
        </button>
        {onCancel && (
          <button type="button" className="button button--ghost" onClick={onCancel} disabled={submitting}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}

interface ServiceFormProps {
  title: string;
  initial?: ServiceInput;
  onCancel?: () => void;
  onSubmit: (input: ServiceInput) => Promise<void>;
}

function ServiceForm({ title, initial, onCancel, onSubmit }: ServiceFormProps) {
  const idPrefix = idSafe(title);
  const [form, setForm] = useState<ServiceInput>(initial ?? EMPTY_SERVICE);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(undefined);
    try {
      await onSubmit(form);
      if (!initial) setForm(EMPTY_SERVICE);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not save this service.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className="card manage-form" onSubmit={(e) => void submit(e)}>
      <h3>{title}</h3>
      {error && <Notice tone="error">{error}</Notice>}
      <div className="manage-form__grid">
        <div className="field manage-form__span2">
          <label className="field__label" htmlFor={`sname-${idPrefix}`}>
            Name
          </label>
          <input
            id={`sname-${idPrefix}`}
            className="input"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
          />
        </div>
        <div className="field manage-form__span2">
          <label className="field__label" htmlFor={`sdesc-${idPrefix}`}>
            Description
          </label>
          <textarea
            id={`sdesc-${idPrefix}`}
            className="input input--textarea"
            rows={2}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            required
          />
        </div>
        <div className="field">
          <label className="field__label" htmlFor={`sdur-${idPrefix}`}>
            Duration (minutes)
          </label>
          <input
            id={`sdur-${idPrefix}`}
            className="input"
            type="number"
            min={5}
            max={240}
            step={5}
            value={form.durationMinutes}
            onChange={(e) => setForm({ ...form, durationMinutes: Number(e.target.value) })}
            required
          />
        </div>
      </div>
      <div className="step__actions">
        <button type="submit" className="button button--primary" disabled={submitting}>
          {submitting && <Spinner />}
          {initial ? 'Save changes' : 'Add service'}
        </button>
        {onCancel && (
          <button type="button" className="button button--ghost" onClick={onCancel} disabled={submitting}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}

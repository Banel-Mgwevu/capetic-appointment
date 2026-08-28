import type { OpeningWindow, Weekday } from '../lib/types';

const DAYS: { key: Weekday; label: string }[] = [
  { key: '1', label: 'Monday' },
  { key: '2', label: 'Tuesday' },
  { key: '3', label: 'Wednesday' },
  { key: '4', label: 'Thursday' },
  { key: '5', label: 'Friday' },
  { key: '6', label: 'Saturday' },
  { key: '0', label: 'Sunday' },
];

const DEFAULT_WINDOW: OpeningWindow = { open: '08:30', close: '16:30' };

interface OpeningHoursEditorProps {
  value: Partial<Record<Weekday, OpeningWindow>>;
  onChange: (next: Partial<Record<Weekday, OpeningWindow>>) => void;
}

/** One row per day: a checkbox for open/closed, and open/close time inputs shown only when open. */
export function OpeningHoursEditor({ value, onChange }: OpeningHoursEditorProps) {
  const setDay = (day: Weekday, window: OpeningWindow | null) => {
    const next = { ...value };
    if (window) next[day] = window;
    else delete next[day];
    onChange(next);
  };

  return (
    <fieldset className="hours-editor">
      <legend className="field__label">Opening hours</legend>
      {DAYS.map(({ key, label }) => {
        const window = value[key];
        return (
          <div key={key} className="hours-editor__row">
            <label className="hours-editor__toggle">
              <input
                type="checkbox"
                checked={Boolean(window)}
                onChange={(e) => setDay(key, e.target.checked ? (window ?? DEFAULT_WINDOW) : null)}
              />
              {label}
            </label>
            {window ? (
              <span className="hours-editor__times">
                <input
                  type="time"
                  className="input input--time"
                  value={window.open}
                  aria-label={`${label} opening time`}
                  onChange={(e) => setDay(key, { ...window, open: e.target.value })}
                />
                <span aria-hidden="true">-</span>
                <input
                  type="time"
                  className="input input--time"
                  value={window.close}
                  aria-label={`${label} closing time`}
                  onChange={(e) => setDay(key, { ...window, close: e.target.value })}
                />
              </span>
            ) : (
              <span className="hours-editor__closed">Closed</span>
            )}
          </div>
        );
      })}
    </fieldset>
  );
}

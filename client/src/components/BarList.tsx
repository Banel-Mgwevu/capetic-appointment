interface BarItem {
  label: string;
  value: number;
  /** Optional second value stacked in a muted colour, e.g. cancellations */
  secondaryValue?: number;
  secondaryLabel?: string;
}

interface BarListProps {
  items: BarItem[];
  unit?: string;
}

/** Simple horizontal bar chart, CSS only — no charting dependency needed for this scale of data. */
export function BarList({ items, unit }: BarListProps) {
  const max = Math.max(1, ...items.map((i) => i.value + (i.secondaryValue ?? 0)));

  if (items.length === 0) {
    return <p className="muted">No data for this range yet.</p>;
  }

  return (
    <ul className="barlist">
      {items.map((item) => (
        <li key={item.label} className="barlist__row">
          <span className="barlist__label" title={item.label}>
            {item.label}
          </span>
          <span className="barlist__track">
            <span className="barlist__bar" style={{ width: `${(item.value / max) * 100}%` }} />
            {item.secondaryValue ? (
              <span
                className="barlist__bar barlist__bar--secondary"
                style={{ width: `${(item.secondaryValue / max) * 100}%` }}
                title={item.secondaryLabel}
              />
            ) : null}
          </span>
          <span className="barlist__value">
            {item.value}
            {unit ?? ''}
            {item.secondaryValue ? <span className="barlist__secondary"> / {item.secondaryValue} cancelled</span> : null}
          </span>
        </li>
      ))}
    </ul>
  );
}

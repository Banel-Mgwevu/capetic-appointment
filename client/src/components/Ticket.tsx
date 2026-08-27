import { formatLongDate, formatTime } from '../lib/dates';
import type { AppointmentStatus, Branch, Service, Slot } from '../lib/types';

export interface TicketProps {
  service?: Service | undefined;
  branch?: Branch | undefined;
  slot?: Pick<Slot, 'startsAt' | 'endsAt'> | undefined;
  customerName?: string | undefined;
  reference?: string | undefined;
  status?: AppointmentStatus | undefined;
  /** Called when a row is clicked, e.g. to jump back to that step */
  onEdit?: ((step: 'service' | 'branch' | 'time') => void) | undefined;
}

/**
 * The booking summary styled as a printed branch slip. During the booking
 * flow it fills in row by row like a form; once confirmed it becomes a torn,
 * stamped paper slip with a reference and a decorative barcode footer.
 */
export function Ticket({ service, branch, slot, customerName, reference, status, onEdit }: TicketProps) {
  const rows: { key: 'service' | 'branch' | 'time'; label: string; value: string | null; hint?: string }[] = [
    { key: 'service', label: 'Service', value: service?.name ?? null, hint: service ? `${service.durationMinutes} min` : undefined },
    { key: 'branch', label: 'Branch', value: branch?.name ?? null, hint: branch?.city },
    {
      key: 'time',
      label: 'When',
      value: slot ? formatLongDate(slot.startsAt) : null,
      hint: slot ? `${formatTime(slot.startsAt)}-${formatTime(slot.endsAt)}` : undefined,
    },
  ];

  const isIssued = Boolean(reference);

  return (
    <aside className={`ticket ticket--${status?.toLowerCase() ?? 'draft'}`} aria-label="Appointment summary">
      <div className="ticket__head">
        <span className="ticket__eyebrow">Capitec branch appointment</span>
        {reference ? (
          <span className="ticket__reference" aria-label={`Reference ${reference}`}>
            {reference}
          </span>
        ) : (
          <span className="ticket__reference ticket__reference--pending" aria-hidden="true">
            APT-······
          </span>
        )}
        {status && <span className="ticket__stamp">{status === 'CONFIRMED' ? 'Confirmed' : 'Cancelled'}</span>}
      </div>

      <div className="ticket__tear" aria-hidden="true" />

      <dl className="ticket__rows">
        {rows.map((row) => (
          <div key={row.key} className={`ticket__row ${row.value ? '' : 'ticket__row--empty'}`}>
            <dt>{row.label}</dt>
            <dd>
              {row.value ? (
                <>
                  <span className="ticket__value">{row.value}</span>
                  {row.hint && <span className="ticket__hint">{row.hint}</span>}
                  {onEdit && !reference && (
                    <button type="button" className="ticket__edit" onClick={() => onEdit(row.key)}>
                      Change
                    </button>
                  )}
                </>
              ) : (
                <span className="ticket__placeholder">Not chosen yet</span>
              )}
            </dd>
          </div>
        ))}
        {customerName && (
          <div className="ticket__row">
            <dt>For</dt>
            <dd>
              <span className="ticket__value">{customerName}</span>
            </dd>
          </div>
        )}
      </dl>

      {branch && isIssued && <p className="ticket__foot">{branch.address}</p>}

      {isIssued && (
        <div className="ticket__slip-footer">
          <div className="ticket__barcode" aria-hidden="true" />
          <p className="ticket__slip-caption">Customer copy · keep for your records</p>
        </div>
      )}

      {isIssued && <div className="ticket__torn-edge" aria-hidden="true" />}
    </aside>
  );
}

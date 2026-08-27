import { formatTime } from '../lib/dates';
import type { Slot } from '../lib/types';

interface SlotGridProps {
  slots: Slot[];
  selected: string | undefined;
  onSelect: (slot: Slot) => void;
}

export function SlotGrid({ slots, selected, onSelect }: SlotGridProps) {
  const morning = slots.filter((s) => formatTime(s.startsAt) < '12:00');
  const afternoon = slots.filter((s) => formatTime(s.startsAt) >= '12:00');

  const renderGroup = (label: string, group: Slot[]) =>
    group.length > 0 && (
      <div className="slots__group" role="group" aria-label={label}>
        <h3 className="slots__label">{label}</h3>
        <div className="slots__grid">
          {group.map((slot) => {
            const isSelected = slot.startsAt === selected;
            return (
              <button
                key={slot.startsAt}
                type="button"
                className={`slot ${isSelected ? 'slot--selected' : ''}`}
                disabled={!slot.available}
                aria-pressed={isSelected}
                aria-label={`${formatTime(slot.startsAt)}${slot.available ? '' : ', unavailable'}`}
                onClick={() => onSelect(slot)}
              >
                {formatTime(slot.startsAt)}
              </button>
            );
          })}
        </div>
      </div>
    );

  return (
    <div className="slots">
      {renderGroup('Morning', morning)}
      {renderGroup('Afternoon', afternoon)}
    </div>
  );
}

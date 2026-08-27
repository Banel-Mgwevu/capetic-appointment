export interface StepDefinition {
  key: string;
  label: string;
}

interface StepperProps {
  steps: StepDefinition[];
  current: number;
  /** Highest step the user has completed; earlier steps are clickable */
  reachable: number;
  onSelect: (index: number) => void;
}

export function Stepper({ steps, current, reachable, onSelect }: StepperProps) {
  return (
    <ol className="stepper" aria-label="Booking progress">
      {steps.map((step, index) => {
        const state = index === current ? 'current' : index < current ? 'done' : 'todo';
        const clickable = index <= reachable && index !== current;
        return (
          <li key={step.key} className={`stepper__item stepper__item--${state}`}>
            {clickable ? (
              <button type="button" className="stepper__button" onClick={() => onSelect(index)}>
                {step.label}
              </button>
            ) : (
              <span className="stepper__button" aria-current={state === 'current' ? 'step' : undefined}>
                {step.label}
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BarList } from './BarList';

describe('BarList', () => {
  it('shows a placeholder when there is no data', () => {
    render(<BarList items={[]} />);
    expect(screen.getByText('No data for this range yet.')).toBeInTheDocument();
  });

  it('renders a row per item with its value', () => {
    render(
      <BarList
        items={[
          { label: 'Sandton City', value: 12, secondaryValue: 3 },
          { label: 'Rosebank Mall', value: 7 },
        ]}
      />,
    );
    expect(screen.getByText('Sandton City')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('/ 3 cancelled')).toBeInTheDocument();
    expect(screen.getByText('Rosebank Mall')).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();
  });
});

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Branch, Service } from '../lib/types';
import { Ticket } from './Ticket';

const service: Service = { id: 1, slug: 'open-account', name: 'Open a new account', description: '', durationMinutes: 30 };
const branch: Branch = {
  id: 1,
  slug: 'sandton-city',
  name: 'Sandton City',
  city: 'Johannesburg',
  address: '83 Rivonia Rd',
  timezone: 'Africa/Johannesburg',
  slotMinutes: 30,
  capacity: 3,
  openingHours: { '1': { open: '08:30', close: '16:30' } },
};

describe('Ticket', () => {
  it('shows placeholders while the booking is still a draft', () => {
    render(<Ticket />);
    expect(screen.getAllByText('Not chosen yet')).toHaveLength(3);
    expect(screen.queryByText(/confirmed/i)).not.toBeInTheDocument();
  });

  it('fills in chosen rows and lets the user jump back to change them', async () => {
    const onEdit = vi.fn();
    render(<Ticket service={service} branch={branch} onEdit={onEdit} />);

    expect(screen.getByText('Open a new account')).toBeInTheDocument();
    expect(screen.getByText('Sandton City')).toBeInTheDocument();
    expect(screen.getByText('Not chosen yet')).toBeInTheDocument();

    const [changeService] = screen.getAllByRole('button', { name: 'Change' });
    await userEvent.click(changeService!);
    expect(onEdit).toHaveBeenCalledWith('service');
  });

  it('renders the reference, stamp and address once confirmed', () => {
    render(
      <Ticket
        reference="APT-7K3M9Q"
        status="CONFIRMED"
        service={service}
        branch={branch}
        slot={{ startsAt: '2026-09-03T09:00', endsAt: '2026-09-03T09:30' }}
        customerName="Banele Ndlovu"
      />,
    );
    expect(screen.getByText('APT-7K3M9Q')).toBeInTheDocument();
    expect(screen.getByText('Confirmed')).toBeInTheDocument();
    expect(screen.getByText('Thursday 3 Sep 2026')).toBeInTheDocument();
    expect(screen.getByText('09:00 – 09:30')).toBeInTheDocument();
    expect(screen.getByText('83 Rivonia Rd')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Change' })).not.toBeInTheDocument();
  });
});

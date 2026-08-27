import type { Appointment, Branch, Service } from '../../repositories/types.js';
import { split, weekdayOf } from '../../domain/time.js';
import type { OutboundMessage } from './notifier.js';

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Tuesday 3 Sep 2026" */
export function formatLongDate(dateTime: string): string {
  const { date } = split(dateTime);
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return `${WEEKDAYS[weekdayOf(date)]} ${d} ${MONTHS[m - 1]} ${y}`;
}

export function formatTime(dateTime: string): string {
  return dateTime.slice(11, 16);
}

function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? fullName;
}

export function confirmationMessages(appointment: Appointment, branch: Branch, service: Service): OutboundMessage[] {
  const when = `${formatLongDate(appointment.startsAt)} at ${formatTime(appointment.startsAt)}`;

  return [
    {
      appointmentId: appointment.id,
      channel: 'EMAIL',
      recipient: appointment.customerEmail,
      subject: `Your branch appointment is confirmed (${appointment.reference})`,
      body: [
        `Hi ${firstName(appointment.customerName)},`,
        '',
        `Your appointment is confirmed.`,
        '',
        `Reference:  ${appointment.reference}`,
        `Service:    ${service.name}`,
        `Branch:     ${branch.name}, ${branch.address}`,
        `When:       ${when} (about ${service.durationMinutes} minutes)`,
        '',
        `Please arrive 5 minutes early and bring your ID document.`,
        `Need to change or cancel? Use your reference on the appointments page.`,
        '',
        `See you soon,`,
        `${branch.name} branch team`,
      ].join('\n'),
    },
    {
      appointmentId: appointment.id,
      channel: 'SMS',
      recipient: appointment.customerPhone,
      body:
        `Hi ${firstName(appointment.customerName)}, your ${service.name.toLowerCase()} appointment at ` +
        `${branch.name} is confirmed for ${when}. Ref ${appointment.reference}. Please bring your ID.`,
    },
  ];
}

export function cancellationMessages(appointment: Appointment, branch: Branch, service: Service): OutboundMessage[] {
  const when = `${formatLongDate(appointment.startsAt)} at ${formatTime(appointment.startsAt)}`;

  return [
    {
      appointmentId: appointment.id,
      channel: 'EMAIL',
      recipient: appointment.customerEmail,
      subject: `Your branch appointment has been cancelled (${appointment.reference})`,
      body: [
        `Hi ${firstName(appointment.customerName)},`,
        '',
        `Your ${service.name.toLowerCase()} appointment at ${branch.name} on ${when} has been cancelled.`,
        `The slot has been released for other customers.`,
        '',
        `You're welcome to book again whenever it suits you.`,
        '',
        `${branch.name} branch team`,
      ].join('\n'),
    },
    {
      appointmentId: appointment.id,
      channel: 'SMS',
      recipient: appointment.customerPhone,
      body: `Your appointment ${appointment.reference} at ${branch.name} on ${when} has been cancelled.`,
    },
  ];
}

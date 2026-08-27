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

function when(appointment: Appointment): string {
  return `${formatLongDate(appointment.startsAt)} at ${formatTime(appointment.startsAt)}`;
}

export function confirmationMessages(appointment: Appointment, branch: Branch, service: Service): OutboundMessage[] {
  return [
    {
      appointmentId: appointment.id,
      channel: 'EMAIL',
      kind: 'CONFIRMATION',
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
        `When:       ${when(appointment)} (about ${service.durationMinutes} minutes)`,
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
      kind: 'CONFIRMATION',
      recipient: appointment.customerPhone,
      body:
        `Hi ${firstName(appointment.customerName)}, your ${service.name.toLowerCase()} appointment at ` +
        `${branch.name} is confirmed for ${when(appointment)}. Ref ${appointment.reference}. Please bring your ID.`,
    },
  ];
}

export function cancellationMessages(appointment: Appointment, branch: Branch, service: Service): OutboundMessage[] {
  return [
    {
      appointmentId: appointment.id,
      channel: 'EMAIL',
      kind: 'CANCELLATION',
      recipient: appointment.customerEmail,
      subject: `Your branch appointment has been cancelled (${appointment.reference})`,
      body: [
        `Hi ${firstName(appointment.customerName)},`,
        '',
        `Your ${service.name.toLowerCase()} appointment at ${branch.name} on ${when(appointment)} has been cancelled.`,
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
      kind: 'CANCELLATION',
      recipient: appointment.customerPhone,
      body: `Your appointment ${appointment.reference} at ${branch.name} on ${when(appointment)} has been cancelled.`,
    },
  ];
}

export function rescheduleMessages(
  appointment: Appointment,
  branch: Branch,
  service: Service,
  previousWhen: string,
): OutboundMessage[] {
  return [
    {
      appointmentId: appointment.id,
      channel: 'EMAIL',
      kind: 'RESCHEDULE',
      recipient: appointment.customerEmail,
      subject: `Your branch appointment has been moved (${appointment.reference})`,
      body: [
        `Hi ${firstName(appointment.customerName)},`,
        '',
        `Your ${service.name.toLowerCase()} appointment at ${branch.name} has been moved.`,
        '',
        `Was:  ${previousWhen}`,
        `Now:  ${when(appointment)}`,
        '',
        `Reference: ${appointment.reference}`,
        `Need to change again or cancel? Use your reference on the appointments page.`,
        '',
        `See you then,`,
        `${branch.name} branch team`,
      ].join('\n'),
    },
    {
      appointmentId: appointment.id,
      channel: 'SMS',
      kind: 'RESCHEDULE',
      recipient: appointment.customerPhone,
      body: `Your appointment ${appointment.reference} at ${branch.name} was moved to ${when(appointment)}.`,
    },
  ];
}

export function reminderMessages(appointment: Appointment, branch: Branch, service: Service): OutboundMessage[] {
  return [
    {
      appointmentId: appointment.id,
      channel: 'EMAIL',
      kind: 'REMINDER',
      recipient: appointment.customerEmail,
      subject: `Reminder: your appointment is tomorrow (${appointment.reference})`,
      body: [
        `Hi ${firstName(appointment.customerName)},`,
        '',
        `This is a reminder about your appointment tomorrow.`,
        '',
        `Reference:  ${appointment.reference}`,
        `Service:    ${service.name}`,
        `Branch:     ${branch.name}, ${branch.address}`,
        `When:       ${when(appointment)}`,
        '',
        `Please arrive 5 minutes early and bring your ID document.`,
        '',
        `See you soon,`,
        `${branch.name} branch team`,
      ].join('\n'),
    },
    {
      appointmentId: appointment.id,
      channel: 'SMS',
      kind: 'REMINDER',
      recipient: appointment.customerPhone,
      body: `Reminder: your ${service.name.toLowerCase()} appointment at ${branch.name} is tomorrow at ${formatTime(appointment.startsAt)}. Ref ${appointment.reference}.`,
    },
  ];
}

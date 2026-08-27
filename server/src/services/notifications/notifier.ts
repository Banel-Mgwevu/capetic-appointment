import type { Notification, NotificationChannel } from '../../repositories/types.js';

export interface OutboundMessage {
  appointmentId: number;
  channel: NotificationChannel;
  recipient: string;
  subject?: string;
  body: string;
}

/**
 * Abstraction over the delivery mechanism. The booking flow only depends on
 * this interface, so swapping the simulated implementation for a real email or
 * SMS gateway is a matter of providing another `Notifier` at composition time.
 */
export interface Notifier {
  send(message: OutboundMessage): Promise<Notification>;
}

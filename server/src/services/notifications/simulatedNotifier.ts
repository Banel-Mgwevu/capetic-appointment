import type { Logger } from '../../logger.js';
import type { NotificationRepository } from '../../repositories/notificationRepository.js';
import type { Notification } from '../../repositories/types.js';
import type { Notifier, OutboundMessage } from './notifier.js';

/**
 * Simulates delivery: the message is persisted with status SENT and echoed to
 * the log. Persisting gives the UI (and support staff) an auditable record of
 * exactly what the customer would have received.
 */
export class SimulatedNotifier implements Notifier {
  constructor(
    private readonly notifications: NotificationRepository,
    private readonly logger: Logger,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  send(message: OutboundMessage): Promise<Notification> {
    const createdAt = this.clock().toISOString();
    const id = this.notifications.insert({
      appointmentId: message.appointmentId,
      channel: message.channel,
      kind: message.kind,
      recipient: message.recipient,
      subject: message.subject ?? null,
      body: message.body,
      status: 'SENT',
      createdAt,
    });

    this.logger.info(
      { notificationId: id, channel: message.channel, appointmentId: message.appointmentId },
      `[SIMULATED ${message.channel}] ${message.subject ?? message.body.slice(0, 60)}`,
    );

    return Promise.resolve({
      id,
      appointmentId: message.appointmentId,
      channel: message.channel,
      kind: message.kind,
      recipient: message.recipient,
      subject: message.subject ?? null,
      body: message.body,
      status: 'SENT',
      createdAt,
    });
  }
}

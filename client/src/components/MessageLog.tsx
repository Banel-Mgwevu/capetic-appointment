import type { NotificationRecord } from '../lib/types';

interface MessageLogProps {
  notifications: NotificationRecord[];
}

/**
 * Shows the simulated confirmation messages exactly as the customer would have
 * received them — an email card and an SMS bubble.
 */
export function MessageLog({ notifications }: MessageLogProps) {
  if (notifications.length === 0) return null;

  return (
    <section className="messages" aria-labelledby="messages-heading">
      <div className="messages__intro">
        <h2 id="messages-heading">What we sent you</h2>
        <p>
          Delivery is simulated in this environment. In production these go out through the bank's email and SMS
          gateways; the content is identical.
        </p>
      </div>
      <ul className="messages__list">
        {notifications.map((n) => (
          <li key={n.id} className={`message message--${n.channel.toLowerCase()}`}>
            <div className="message__meta">
              <span className="message__channel">{n.channel === 'EMAIL' ? 'Email' : 'SMS'}</span>
              <span className="message__to">to {n.recipient}</span>
              <span className="message__status">{n.status === 'SENT' ? 'Delivered (simulated)' : n.status}</span>
            </div>
            {n.subject && <p className="message__subject">{n.subject}</p>}
            <pre className="message__body">{n.body}</pre>
          </li>
        ))}
      </ul>
    </section>
  );
}

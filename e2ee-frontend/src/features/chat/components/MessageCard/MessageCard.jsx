import { Check, CheckCheck, Clock3, RotateCcw } from 'lucide-react';
import { getMessageStatusLabel } from '../../messageStatus';

import './MessageCard.css';

function highlightText(text, query) {
  const source = String(text ?? '');
  const cleanQuery = query.trim();
  if (!cleanQuery) return source;

  const normalizedSource = source.toLocaleLowerCase('ru-RU');
  const normalizedQuery = cleanQuery.toLocaleLowerCase('ru-RU');
  const parts = [];
  let cursor = 0;
  let matchIndex = normalizedSource.indexOf(normalizedQuery, cursor);

  while (matchIndex !== -1) {
    if (matchIndex > cursor) {
      parts.push(source.slice(cursor, matchIndex));
    }
    const matchEnd = matchIndex + cleanQuery.length;
    parts.push(
      <mark key={`${matchIndex}-${matchEnd}`}>
        {source.slice(matchIndex, matchEnd)}
      </mark>,
    );
    cursor = matchEnd;
    matchIndex = normalizedSource.indexOf(normalizedQuery, cursor);
  }

  if (cursor < source.length) parts.push(source.slice(cursor));
  return parts;
}

export default function MessageCard({
  text,
  time,
  isMine = false,
  status = "",
  highlightQuery = '',
  onRetry,
}) {
  const statusLabel = getMessageStatusLabel(status);
  const statusIcon = {
    sending: <Clock3 size={13} />,
    sent: <Check size={14} />,
    delivered: <CheckCheck size={14} />,
    read: <CheckCheck size={14} />,
  }[status];

  return (
    <article className={`message-card ${isMine ? 'is-mine' : ''} ${status === 'error' ? 'has-error' : ''}`}>
      <p className="message-card__text">
        {highlightText(text, highlightQuery)}
      </p>

      <div className="message-card__meta">
        <time>{time}</time>

        {isMine && (
          status === 'error' ? (
            <button
              className="message-status message-status--retry"
              type="button"
              title="Повторить отправку"
              aria-label="Повторить отправку сообщения"
              onClick={onRetry}
            >
              <RotateCcw size={13} />
              Повторить
            </button>
          ) : (
            <span
              className={`message-status message-status--${status}`}
              title={statusLabel}
              aria-label={statusLabel}
            >
              {statusIcon}
            </span>
          )
        )}
      </div>
    </article>
  );
}

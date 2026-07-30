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
}) {
  return (
    <article className={`message-card ${isMine ? 'is-mine' : ''}`}>
      <p className="message-card__text">
        {highlightText(text, highlightQuery)}
      </p>

      <div className="message-card__meta">
        <time>{time}</time>

        {isMine && (
          <span className="message-status">
            {status === 'read' ? '✓✓' : '✓'}
          </span>
        )}
      </div>
    </article>
  );
}

import './MessageCard.css';

export default function MessageCard({
  text,
  time,
  isMine = false,
  status = "",
}) {
  return (
    <article className={`message-card ${isMine ? 'is-mine' : ''}`}>
      <p className="message-card__text">
        {text}
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

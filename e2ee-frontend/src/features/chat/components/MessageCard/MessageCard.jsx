import { useState } from 'react';
import {
  Check,
  CheckCheck,
  Clock3,
  MoreHorizontal,
  Pencil,
  Reply,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import { MESSAGE_REACTIONS } from '../../messageEvents';
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
  message,
  currentUsername,
  edited = false,
  deleted = false,
  replyTo = null,
  reactions = [],
  highlightQuery = '',
  onRetry,
  onReply,
  onEdit,
  onDelete,
  onToggleReaction,
}) {
  const [actionsOpen, setActionsOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const statusLabel = getMessageStatusLabel(status);
  const statusIcon = {
    sending: <Clock3 size={13} />,
    sent: <Check size={14} />,
    delivered: <CheckCheck size={14} />,
    read: <CheckCheck size={14} />,
  }[status];
  const actionsAvailable = !deleted && !['sending', 'error'].includes(status);

  const runAction = (action) => {
    setActionsOpen(false);
    setDeleteConfirm(false);
    action?.(message);
  };

  return (
    <article className={`message-card ${isMine ? 'is-mine' : ''} ${status === 'error' ? 'has-error' : ''}`}>
      {replyTo && (
        <div className="message-card__reply">
          <strong>
            {replyTo.from === currentUsername ? 'Вы' : 'Собеседник'}
          </strong>
          <span>
            {!replyTo.available
              ? 'Сообщение не загружено'
              : replyTo.deleted
                ? 'Сообщение удалено'
                : replyTo.text}
          </span>
        </div>
      )}

      {deleted ? (
        <p className="message-card__deleted">Сообщение удалено</p>
      ) : (
        <p className="message-card__text">
          {highlightText(text, highlightQuery)}
        </p>
      )}

      {!deleted && reactions.length > 0 && (
        <div className="message-card__reactions">
          {reactions.map((reaction) => (
            <button
              key={reaction.emoji}
              className={reaction.reactedByMe ? 'is-mine' : ''}
              type="button"
              aria-label={`${reaction.emoji}, реакций: ${reaction.count}`}
              onClick={() => onToggleReaction?.(message, reaction.emoji)}
            >
              <span>{reaction.emoji}</span>
              {reaction.count}
            </button>
          ))}
        </div>
      )}

      <div className="message-card__meta">
        {edited && !deleted && <span>изменено</span>}
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

        {actionsAvailable && (
          <div className="message-card__actions">
            <button
              className="message-card__actions-trigger"
              type="button"
              aria-label="Действия с сообщением"
              aria-expanded={actionsOpen}
              onClick={() => {
                setDeleteConfirm(false);
                setActionsOpen((current) => !current);
              }}
            >
              <MoreHorizontal size={16} />
            </button>

            {actionsOpen && (
              <div className="message-card__menu" role="menu">
                {deleteConfirm ? (
                  <div className="message-card__delete-confirm">
                    <strong>Удалить сообщение для всех?</strong>
                    <div>
                      <button
                        className="is-danger"
                        type="button"
                        onClick={() => runAction(onDelete)}
                      >
                        Удалить
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteConfirm(false)}
                      >
                        Отмена
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div
                      className="message-card__reaction-picker"
                      aria-label="Добавить реакцию"
                    >
                      {MESSAGE_REACTIONS.map((emoji) => (
                        <button
                          key={emoji}
                          type="button"
                          aria-label={`Реакция ${emoji}`}
                          onClick={() => {
                            setActionsOpen(false);
                            onToggleReaction?.(message, emoji);
                          }}
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => runAction(onReply)}
                    >
                      <Reply size={15} />
                      Ответить
                    </button>
                    {isMine && (
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => runAction(onEdit)}
                      >
                        <Pencil size={15} />
                        Редактировать
                      </button>
                    )}
                    {isMine && (
                      <button
                        className="is-danger"
                        type="button"
                        role="menuitem"
                        onClick={() => setDeleteConfirm(true)}
                      >
                        <Trash2 size={15} />
                        Удалить
                      </button>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </article>
  );
}

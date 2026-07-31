import { useLayoutEffect, useMemo, useRef } from 'react';
import { groupMessagesByDay } from '../../messageDates';
import DaySeparator from '../DaySeparator/DaySeparator';
import MessageCard from '../MessageCard/MessageCard';

import './MessageList.css';

export default function MessageList({
  messages = [],
  username,
  highlightQuery = '',
  emptyMessage = 'Нет сообщений',
  onRetryMessage,
  hasOlderMessages = false,
  historyLoading = false,
  onLoadOlderMessages,
}) {
  const listRef = useRef(null);
  const scrollMetricsRef = useRef(null);
  const messageGroups = useMemo(() => groupMessagesByDay(messages), [messages]);
  const firstMessageId = messages[0]?.id ?? null;
  const lastMessageId = messages.at(-1)?.id ?? null;

  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;

    const previous = scrollMetricsRef.current;
    if (
      previous &&
      previous.firstMessageId !== firstMessageId &&
      previous.lastMessageId === lastMessageId
    ) {
      list.scrollTop += list.scrollHeight - previous.scrollHeight;
    } else if (!previous || previous.lastMessageId !== lastMessageId) {
      list.scrollTop = list.scrollHeight;
    }

    scrollMetricsRef.current = {
      firstMessageId,
      lastMessageId,
      scrollHeight: list.scrollHeight,
    };
  }, [firstMessageId, lastMessageId, messages]);

  return (
    <div className="message-list" ref={listRef}>
      {hasOlderMessages && (
        <button
          className="message-list__load-older"
          type="button"
          disabled={historyLoading}
          onClick={onLoadOlderMessages}
        >
          {historyLoading ? 'Загружаем…' : 'Загрузить предыдущие сообщения'}
        </button>
      )}

      {messages.length === 0 ? (
        <div className="message-list__empty">{emptyMessage}</div>
      ) : (
        messageGroups.map((group) => (
          <div className="message-list__day" key={group.key}>
            <DaySeparator label={group.label} />
            {group.messages.map((message) => (
              <MessageCard
                key={message.id}
                text={message.text || message.content}
                time={message.time}
                isMine={message.from === username || message.isMine}
                status={message.status}
                edited={message.edited}
                deleted={message.deleted}
                highlightQuery={highlightQuery}
                onRetry={() => onRetryMessage?.(message.id)}
              />
            ))}
          </div>
        ))
      )}
    </div>
  );
}

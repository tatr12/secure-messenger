import { useEffect, useRef } from "react";
import DaySeparator from '../DaySeparator/DaySeparator';
import MessageCard from '../MessageCard/MessageCard';

import './MessageList.css';

export default function MessageList({ messages = [], username }) {
  const listRef = useRef(null);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;

    list.scrollTop = list.scrollHeight;
  }, [messages]);

  return (
    <div className="message-list" ref={listRef}>
      <DaySeparator label="Сегодня" />

      {messages.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '40px',
          color: '#999'
        }}>
          Нет сообщений
        </div>
      ) : (
        messages.map((message) => (
          <MessageCard
            key={message.id}
            text={message.text || message.content}
            time={message.time}
            isMine={message.from === username || message.isMine}
            status={message.status}
            edited={message.edited}
            deleted={message.deleted}
          />
        ))
      )}
    </div>
  );
}

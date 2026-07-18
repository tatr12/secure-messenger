import { Search, SquarePen } from 'lucide-react';

import './ChatList.css';

const demoChats = [
  {
    id: 1,
    name: 'Александр',
    message: 'Привет! Как дела?',
    time: '12:41',
    unread: 2,
    online: true,
  },
  {
    id: 2,
    name: 'Мария',
    message: 'Увидимся позже',
    time: '11:42',
    unread: 0,
    online: true,
  },
  {
    id: 3,
    name: 'Дмитрий',
    message: 'Отправил документ',
    time: '10:20',
    unread: 0,
    online: false,
  },
  {
    id: 4,
    name: 'Рабочий чат',
    message: 'Иван: принято',
    time: '09:30',
    unread: 0,
    online: false,
  },
];

export default function ChatList() {
  return (
    <section className="chat-list">
      <header className="chat-list__header">
        <div>
          <h1>Чаты</h1>
          <span>4 диалога</span>
        </div>

        <button
          className="chat-list__compose"
          type="button"
          aria-label="Новый чат"
          title="Новый чат"
        >
          <SquarePen size={18} strokeWidth={1.8} />
        </button>
      </header>

      <label className="chat-list__search">
        <Search size={17} strokeWidth={1.8} />

        <input
          type="search"
          placeholder="Поиск"
          aria-label="Поиск чатов"
        />
      </label>

      <div className="chat-list__items">
        {demoChats.map((chat, index) => (
          <button
            key={chat.id}
            className={`chat-list__item ${index === 0 ? 'is-active' : ''}`}
            type="button"
          >
            <div className="chat-list__avatar">
              {chat.name.slice(0, 1)}

              {chat.online && (
                <span className="chat-list__online" />
              )}
            </div>

            <div className="chat-list__content">
              <div className="chat-list__topline">
                <strong>{chat.name}</strong>
                <time>{chat.time}</time>
              </div>

              <div className="chat-list__bottomline">
                <span>{chat.message}</span>

                {chat.unread > 0 && (
                  <span className="chat-list__unread">
                    {chat.unread}
                  </span>
                )}
              </div>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}

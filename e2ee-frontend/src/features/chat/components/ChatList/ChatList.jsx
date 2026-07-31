
import { useMemo, useRef, useState } from 'react';
import { BellOff, Pin, Search, SquarePen } from 'lucide-react';
import {
  buildChatSummaries,
  filterChatSummaries,
  getChatPreview,
} from '../../conversationMessages';

import './ChatList.css';

const CHAT_FILTERS = [
  { id: 'all', label: 'Все' },
  { id: 'unread', label: 'Непрочитанные' },
  { id: 'archive', label: 'Архив' },
];

function getDialogCountLabel(count) {
  const lastDigit = count % 10;
  const lastTwoDigits = count % 100;
  if (lastDigit === 1 && lastTwoDigits !== 11) return 'диалог';
  if (
    [2, 3, 4].includes(lastDigit) &&
    ![12, 13, 14].includes(lastTwoDigits)
  ) return 'диалога';
  return 'диалогов';
}

export default function ChatList({
  chatPartners = [],
  userCache = {},
  activeChatUser,
  setActiveChatUser,
  searchQuery = '',
  setSearchQuery,
  searchResults = [],
  tryStartChat,
  messages = [],
  username: currentUsername,
  unreadCounts = {},
  historyPartners = [],
  chatPreferences = {},
}) {
  const searchInputRef = useRef(null);
  const [activeFilter, setActiveFilter] = useState('all');
  const historyPartnerSet = useMemo(
    () => new Set(historyPartners),
    [historyPartners],
  );
  const chatSummaries = useMemo(
    () => buildChatSummaries(
      chatPartners,
      messages,
      currentUsername,
      unreadCounts,
      chatPreferences,
    ),
    [
      chatPartners,
      chatPreferences,
      currentUsername,
      messages,
      unreadCounts,
    ],
  );
  const visibleChatSummaries = useMemo(
    () => filterChatSummaries(chatSummaries, activeFilter),
    [activeFilter, chatSummaries],
  );

  const startNewChat = () => {
    setSearchQuery('');
    searchInputRef.current?.focus();
  };

  return (
    <section className="chat-list">
      <header className="chat-list__header">
        <div>
          <h1>Чаты</h1>
          <span>
            {chatPartners.length} {getDialogCountLabel(chatPartners.length)}
          </span>
        </div>

        <button
          className="chat-list__compose"
          type="button"
          aria-label="Новый чат"
          title="Новый чат"
          onClick={startNewChat}
        >
          <SquarePen size={18} strokeWidth={1.8} />
        </button>
      </header>

      <label className="chat-list__search">
        <Search size={17} strokeWidth={1.8} />

        <input
          ref={searchInputRef}
          type="search"
          placeholder="Поиск"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </label>

      <div className="chat-list__filters" aria-label="Фильтр чатов">
        {CHAT_FILTERS.map((filter) => (
          <button
            key={filter.id}
            className={activeFilter === filter.id ? 'is-active' : ''}
            type="button"
            aria-pressed={activeFilter === filter.id}
            onClick={() => setActiveFilter(filter.id)}
          >
            {filter.label}
          </button>
        ))}
      </div>


      {searchResults.length > 0 && (
        <div className="chat-list__items">
          {searchResults.map((user) => (
            <button
              key={user.username}
              className="chat-list__item"
              type="button"
              onClick={() => tryStartChat(user.username)}
            >
              <div className="chat-list__avatar">
                {user.username[0].toUpperCase()}
              </div>

              <div className="chat-list__content">
                <strong>
                  {user.display_name || user.username}
                </strong>

                <span>
                  @{user.username}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}


      <div className="chat-list__items">

        {visibleChatSummaries.length === 0 ? (
          <div className="chat-list__empty">
            {activeFilter === 'unread' && 'Нет непрочитанных чатов'}
            {activeFilter === 'archive' && 'Архив пуст'}
            {activeFilter === 'all' && (
              chatSummaries.length > 0 ? 'Все чаты в архиве' : 'Нет диалогов'
            )}
          </div>
        ) : (

          visibleChatSummaries.map(({
            partner,
            lastMessage,
            unreadCount,
            pinned,
            muted,
          }) => (
            <button
              key={partner}
              className={`chat-list__item ${
                activeChatUser === partner ? 'is-active' : ''
              }`}
              type="button"
              onClick={() => setActiveChatUser(partner)}
            >

              <div className="chat-list__avatar">
                {(userCache[partner] || partner)[0].toUpperCase()}
              </div>


              <div className="chat-list__content">

                <div className="chat-list__topline">
                  <strong>
                    {userCache[partner] || partner}
                  </strong>
                  <div className="chat-list__meta">
                    {pinned && (
                      <Pin size={12} aria-label="Чат закреплён" />
                    )}
                    {muted && (
                      <BellOff size={13} aria-label="Уведомления выключены" />
                    )}
                    {lastMessage?.time && <time>{lastMessage.time}</time>}
                  </div>
                </div>


                <div className="chat-list__bottomline">
                  <span className={lastMessage?.status === 'error' ? 'is-error' : ''}>
                    {getChatPreview(
                      lastMessage,
                      currentUsername,
                      historyPartnerSet.has(partner),
                    )}
                  </span>
                  {unreadCount > 0 && (
                    <span
                      className="chat-list__unread"
                      aria-label={`${unreadCount} непрочитанных`}
                    >
                      {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                  )}
                </div>

              </div>

            </button>
          ))

        )}

      </div>

    </section>
  );
}

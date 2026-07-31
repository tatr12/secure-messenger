
import { useMemo, useRef } from 'react';
import { Search, SquarePen } from 'lucide-react';
import {
  buildChatSummaries,
  getChatPreview,
} from '../../conversationMessages';

import './ChatList.css';

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
}) {
  const searchInputRef = useRef(null);
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
    ),
    [chatPartners, currentUsername, messages, unreadCounts],
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
          <span>{chatPartners.length} диалогов</span>
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

        {chatPartners.length === 0 ? (
          <div style={{
            padding: '30px',
            textAlign: 'center',
            color: '#999'
          }}>
            Нет диалогов
          </div>
        ) : (

          chatSummaries.map(({ partner, lastMessage, unreadCount }) => (
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
                  {lastMessage?.time && <time>{lastMessage.time}</time>}
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

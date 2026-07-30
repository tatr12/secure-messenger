
import { Search, SquarePen } from 'lucide-react';

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
}) {
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
        >
          <SquarePen size={18} strokeWidth={1.8} />
        </button>
      </header>

      <label className="chat-list__search">
        <Search size={17} strokeWidth={1.8} />

        <input
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

          chatPartners.map((username) => (
            <button
              key={username}
              className={`chat-list__item ${
                activeChatUser === username ? 'is-active' : ''
              }`}
              type="button"
              onClick={() => setActiveChatUser(username)}
            >

              <div className="chat-list__avatar">
                {(userCache[username] || username)[0].toUpperCase()}
              </div>


              <div className="chat-list__content">

                <div className="chat-list__topline">
                  <strong>
                    {userCache[username] || username}
                  </strong>
                </div>


                <div className="chat-list__bottomline">
                  <span>
                    Начать диалог
                  </span>
                </div>

              </div>

            </button>
          ))

        )}

      </div>

    </section>
  );
}

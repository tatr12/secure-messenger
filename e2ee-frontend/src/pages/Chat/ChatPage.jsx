
import { useState } from 'react';
import ChatList from '../../features/chat/components/ChatList/ChatList';
import Conversation from '../../features/chat/components/Conversation/Conversation';
import Sidebar from '../../features/chat/components/Sidebar/Sidebar';

import './ChatPage.css';


function sessionDeviceName(userAgent) {
  if (!userAgent) return 'Неизвестное устройство';

  const browser = userAgent.includes('Firefox/')
    ? 'Firefox'
    : userAgent.includes('Edg/')
      ? 'Edge'
      : userAgent.includes('Chrome/')
        ? 'Chrome'
        : userAgent.includes('Safari/')
          ? 'Safari'
          : 'Браузер';
  const platform = userAgent.includes('Windows')
    ? 'Windows'
    : userAgent.includes('Macintosh')
      ? 'macOS'
      : userAgent.includes('Android')
        ? 'Android'
        : userAgent.includes('iPhone') || userAgent.includes('iPad')
          ? 'iOS'
          : userAgent.includes('Linux')
            ? 'Linux'
            : 'устройство';
  return `${browser} · ${platform}`;
}


function sessionLastUsed(value) {
  if (!value) return 'Время неизвестно';
  return new Date(value).toLocaleString('ru-RU', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}


export default function ChatPage({ messenger }) {
  const [logoutConfirm, setLogoutConfirm] = useState(false);
  const [accountMenu, setAccountMenu] = useState(false);
  const [sessionsOpen, setSessionsOpen] = useState(false);


  return (
    <main className="chat-page">

      <Sidebar
        onLogout={() => setAccountMenu(!accountMenu)}
      />



      {accountMenu && (
        <div className="account-menu">

          <div className="account-header">
            <div className="account-avatar">
              {messenger.displayName?.[0] || 'V'}
            </div>

            <div>
              <div className="account-name">
                {messenger.displayName || messenger.username}
              </div>

              <div className="account-login">
                @{messenger.username}
              </div>

              <div className="account-status">
                ● В сети
              </div>
            </div>
          </div>


          <div className="account-divider"/>


          <button
            className="account-action"
            type="button"
            onClick={() => {
              setAccountMenu(false);
              setSessionsOpen(true);
              messenger.loadSessions();
            }}
          >
            Устройства и сессии
          </button>


          <button
            className="account-action"
            type="button"
            onClick={() => {
              setAccountMenu(false);
              messenger.switchAccount();
            }}
          >
            ↻ Сменить аккаунт
          </button>


          <button
            className="account-action"
            type="button"
            onClick={() => {
              setAccountMenu(false);
              setLogoutConfirm(true);
            }}
          >
            Выйти
          </button>


        </div>
      )}


      {sessionsOpen && (
        <div
          className="logout-overlay"
          onClick={() => setSessionsOpen(false)}
        >
          <section
            className="sessions-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="sessions-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="sessions-heading">
              <div>
                <h3 id="sessions-title">Активные сессии</h3>
                <p>Устройства, на которых выполнен вход в VØIDEN</p>
              </div>
              <button
                className="sessions-close"
                type="button"
                aria-label="Закрыть"
                onClick={() => setSessionsOpen(false)}
              >
                ×
              </button>
            </div>

            <div className="sessions-list">
              {messenger.sessionsLoading && (
                <div className="sessions-empty">Загрузка…</div>
              )}

              {!messenger.sessionsLoading && messenger.sessions.length === 0 && (
                <div className="sessions-empty">Активные сессии не найдены</div>
              )}

              {!messenger.sessionsLoading && messenger.sessions.map((session) => (
                <article className="session-row" key={session.id}>
                  <div className="session-device-icon">◈</div>
                  <div className="session-details">
                    <div className="session-name">
                      {sessionDeviceName(session.user_agent)}
                      {session.current && (
                        <span className="session-current">Текущая</span>
                      )}
                    </div>
                    <div className="session-time">
                      Активность: {sessionLastUsed(session.last_used_at)}
                    </div>
                  </div>
                  {!session.current && (
                    <button
                      className="session-revoke"
                      type="button"
                      onClick={() => messenger.revokeDeviceSession(session.id)}
                    >
                      Завершить
                    </button>
                  )}
                </article>
              ))}
            </div>
          </section>
        </div>
      )}



      {logoutConfirm && (
        <div className="logout-overlay">

          <div className="logout-dialog">

            <h3>Выйти из аккаунта?</h3>

            <p>
              Вы сможете войти снова в любое время
            </p>


            <button
              type="button"
              onClick={() => {
                setLogoutConfirm(false);
                setAccountMenu(false);
                messenger.logout();
              }}
            >
              Выйти
            </button>


            <button
              type="button"
              onClick={() => setLogoutConfirm(false)}
            >
              Отмена
            </button>

          </div>

        </div>
      )}



      <ChatList
        chatPartners={messenger.chatPartners}
        userCache={messenger.userCache}
        activeChatUser={messenger.activeChatUser}
        setActiveChatUser={messenger.setActiveChatUser}
        searchQuery={messenger.searchQuery}
        setSearchQuery={messenger.setSearchQuery}
        searchResults={messenger.searchResults}
        tryStartChat={messenger.tryStartChat}
      />

      {messenger.activeChatUser ? (
        <Conversation
          messages={messenger.allMessages || []}
          activeChatUser={messenger.activeChatUser}
          username={messenger.username}
          sendMessage={(text) => {
            messenger.sendMessage(
              messenger.activeChatUser,
              text
            );
          }}
        />
      ) : (
        <div className="empty-chat">
          <h2>Выберите чат</h2>
          <p>
            Выберите собеседника слева, чтобы начать переписку
          </p>
        </div>
      )}

    </main>
  );
}

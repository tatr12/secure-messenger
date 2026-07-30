
import { useState } from 'react';
import ChatList from '../../features/chat/components/ChatList/ChatList';
import Conversation from '../../features/chat/components/Conversation/Conversation';
import Sidebar from '../../features/chat/components/Sidebar/Sidebar';

import './ChatPage.css';


export default function ChatPage({ messenger }) {
  const [logoutConfirm, setLogoutConfirm] = useState(false);
  const [accountMenu, setAccountMenu] = useState(false);


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

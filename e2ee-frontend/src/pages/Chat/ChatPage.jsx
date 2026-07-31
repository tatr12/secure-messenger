
import { useState } from 'react';
import {
  Eye,
  LogOut,
  MonitorSmartphone,
  RefreshCw,
  Settings,
} from 'lucide-react';
import AccountCenter from '../../features/account/components/AccountCenter/AccountCenter';
import ChatList from '../../features/chat/components/ChatList/ChatList';
import Conversation from '../../features/chat/components/Conversation/Conversation';
import Sidebar from '../../features/chat/components/Sidebar/Sidebar';
import PartnerProfileDialog from '../../features/profile/components/PartnerProfileDialog/PartnerProfileDialog';

import './ChatPage.css';

export default function ChatPage({ messenger }) {
  const [logoutConfirm, setLogoutConfirm] = useState(false);
  const [accountMenu, setAccountMenu] = useState(false);
  const [accountView, setAccountView] = useState(null);

  const openAccountCenter = (view) => {
    setAccountMenu(false);
    setAccountView(view);
    if (view === 'sessions') messenger.loadSessions();
  };

  return (
    <main className="chat-page">
      <Sidebar
        onSectionChange={(section) => {
          if (section === 'chats') return;
          const sectionNames = {
            groups: 'Группы',
            calls: 'Звонки',
            files: 'Файлы',
          };
          messenger.showNotification(
            `${sectionNames[section]} будут реализованы отдельным этапом.`,
            'info',
          );
        }}
        onOpenSettings={() => openAccountCenter('settings')}
        onOpenAccount={() => setAccountMenu((current) => !current)}
      />

      {accountMenu && (
        <>
          <button
            className="account-menu__backdrop"
            type="button"
            aria-label="Закрыть меню аккаунта"
            onClick={() => setAccountMenu(false)}
          />
          <div className="account-menu">
            <div className="account-header">
              <div className="account-avatar">
                {messenger.displayName?.[0] || 'V'}
              </div>

              <div>
                <div className="account-name">
                  {messenger.displayName || messenger.username}
                </div>
                <div className="account-login">@{messenger.username}</div>
                <div className="account-status">● В сети</div>
              </div>
            </div>

            <div className="account-divider" />

            <button
              className="account-action"
              type="button"
              onClick={() => openAccountCenter('profile')}
            >
              <Eye size={17} />
              Посмотреть профиль
            </button>
            <button
              className="account-action"
              type="button"
              onClick={() => openAccountCenter('settings')}
            >
              <Settings size={17} />
              Настройки
            </button>
            <button
              className="account-action"
              type="button"
              onClick={() => openAccountCenter('sessions')}
            >
              <MonitorSmartphone size={17} />
              Устройства и сессии
            </button>

            <div className="account-divider" />

            <button
              className="account-action"
              type="button"
              onClick={() => {
                setAccountMenu(false);
                messenger.switchAccount();
              }}
            >
              <RefreshCw size={17} />
              Сменить аккаунт
            </button>
            <button
              className="account-action account-action--danger"
              type="button"
              onClick={() => {
                setAccountMenu(false);
                setLogoutConfirm(true);
              }}
            >
              <LogOut size={17} />
              Выйти
            </button>
          </div>
        </>
      )}

      {accountView && (
        <AccountCenter
          key={accountView}
          initialView={accountView}
          profile={{
            username: messenger.username,
            displayName: messenger.displayName,
            email: messenger.email,
            bio: messenger.bio,
          }}
          sessions={messenger.sessions}
          sessionsLoading={messenger.sessionsLoading}
          onClose={() => setAccountView(null)}
          onLoadSessions={messenger.loadSessions}
          onRevokeSession={messenger.revokeDeviceSession}
          onSaveProfile={messenger.changeProfileData}
        />
      )}

      {messenger.viewingPartnerProfile && (
        <PartnerProfileDialog
          profile={messenger.viewingPartnerProfile}
          onClose={() => messenger.setViewingPartnerProfile(null)}
        />
      )}

      {logoutConfirm && (
        <div className="logout-overlay">
          <div className="logout-dialog">
            <h3>Выйти из аккаунта?</h3>
            <p>Вы сможете войти снова в любое время</p>
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
        messages={messenger.allMessages}
        username={messenger.username}
        unreadCounts={messenger.unreadCounts}
        historyPartners={messenger.historyPartners}
        chatPreferences={messenger.chatPreferences}
      />

      {messenger.activeChatUser ? (
        <Conversation
          key={messenger.activeChatUser}
          messages={messenger.allMessages || []}
          activeChatUser={messenger.activeChatUser}
          activeChatDisplayName={
            messenger.userCache[messenger.activeChatUser] ||
            messenger.activeChatUser
          }
          username={messenger.username}
          onOpenProfile={() =>
            messenger.inspectPartnerProfile(messenger.activeChatUser)
          }
          onUnavailableAction={(feature) =>
            messenger.showNotification(
              `${feature} будут реализованы отдельным безопасным этапом.`,
              'info',
            )
          }
          sendMessage={(text) => {
            messenger.sendMessage(messenger.activeChatUser, text);
          }}
          onRetryMessage={messenger.retryMessage}
          hasOlderMessages={messenger.hasOlderMessages}
          historyLoading={messenger.historyLoading}
          onLoadOlderMessages={messenger.loadOlderMessages}
          chatPreference={
            messenger.chatPreferences[messenger.activeChatUser] || {}
          }
          preferenceSaving={Boolean(
            messenger.chatPreferenceSaving[messenger.activeChatUser]
          )}
          onTogglePin={() => {
            const preference =
              messenger.chatPreferences[messenger.activeChatUser] || {};
            messenger.saveChatPreference(messenger.activeChatUser, {
              pinned: !preference.pinned,
            });
          }}
          onToggleMute={() => {
            const preference =
              messenger.chatPreferences[messenger.activeChatUser] || {};
            messenger.saveChatPreference(messenger.activeChatUser, {
              muted: !preference.muted,
            });
          }}
          onToggleArchive={() => {
            const preference =
              messenger.chatPreferences[messenger.activeChatUser] || {};
            messenger.saveChatPreference(messenger.activeChatUser, {
              archived: !preference.archived,
            });
          }}
        />
      ) : (
        <div className="empty-chat">
          <h2>Выберите чат</h2>
          <p>Выберите собеседника слева, чтобы начать переписку</p>
        </div>
      )}

    </main>
  );
}

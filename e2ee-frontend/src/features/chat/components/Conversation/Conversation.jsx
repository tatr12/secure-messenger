import { useMemo, useState } from 'react';
import { Search, X } from 'lucide-react';
import {
  getConversationMessages,
  searchConversationMessages,
} from '../../conversationMessages';
import Composer from '../Composer/Composer';
import MessageList from '../MessageList/MessageList';
import TopBar from '../TopBar/TopBar';

import './Conversation.css';

export default function Conversation({
  messages = [],
  activeChatUser,
  activeChatDisplayName,
  sendMessage,
  username,
  onOpenProfile,
  onUnavailableAction,
  onRetryMessage,
  hasOlderMessages,
  historyLoading,
  onLoadOlderMessages,
  chatPreference,
  preferenceSaving,
  onTogglePin,
  onToggleMute,
  onToggleArchive,
}) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [messageSearch, setMessageSearch] = useState('');
  const conversationMessages = useMemo(
    () => getConversationMessages(messages, username, activeChatUser),
    [activeChatUser, messages, username],
  );
  const visibleMessages = useMemo(
    () => searchConversationMessages(conversationMessages, messageSearch),
    [conversationMessages, messageSearch],
  );

  const toggleSearch = () => {
    if (searchOpen) setMessageSearch('');
    setSearchOpen(!searchOpen);
  };

  return (
    <section className="conversation">
      <div className="conversation__header">
        <TopBar
          displayName={activeChatDisplayName}
          username={activeChatUser}
          searchOpen={searchOpen}
          onToggleSearch={toggleSearch}
          onAudioCall={() => onUnavailableAction('Аудиозвонки')}
          onVideoCall={() => onUnavailableAction('Видеозвонки')}
          onOpenProfile={onOpenProfile}
          chatPreference={chatPreference}
          preferenceSaving={preferenceSaving}
          onTogglePin={onTogglePin}
          onToggleMute={onToggleMute}
          onToggleArchive={onToggleArchive}
        />

        {searchOpen && (
          <label className="conversation__search">
            <Search size={17} />
            <input
              type="search"
              placeholder="Поиск в этом диалоге"
              value={messageSearch}
              onChange={(event) => setMessageSearch(event.target.value)}
              autoFocus
            />
            <span>
              {messageSearch.trim()
                ? `${visibleMessages.length} из ${conversationMessages.length}`
                : `${conversationMessages.length} сообщений`}
            </span>
            <button
              type="button"
              aria-label="Закрыть поиск"
              onClick={toggleSearch}
            >
              <X size={17} />
            </button>
          </label>
        )}
      </div>

      <MessageList
        messages={visibleMessages}
        username={username}
        highlightQuery={messageSearch}
        emptyMessage={
          messageSearch.trim() ? 'Совпадений не найдено' : 'Нет сообщений'
        }
        onRetryMessage={onRetryMessage}
        hasOlderMessages={hasOlderMessages && !messageSearch.trim()}
        historyLoading={historyLoading}
        onLoadOlderMessages={onLoadOlderMessages}
      />

      <Composer onSend={sendMessage} />
    </section>
  );
}

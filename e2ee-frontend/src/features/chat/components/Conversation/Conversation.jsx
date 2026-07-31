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
  onEditMessage,
  onDeleteMessage,
  onToggleReaction,
}) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [messageSearch, setMessageSearch] = useState('');
  const [composerContext, setComposerContext] = useState(null);
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

  const submitComposer = (text) => {
    if (composerContext?.mode === 'edit') {
      const saved = onEditMessage?.(composerContext.message.id, text);
      if (saved !== false) setComposerContext(null);
      return saved;
    }

    const sent = sendMessage(text, {
      replyTo: composerContext?.mode === 'reply'
        ? composerContext.message.id
        : null,
    });
    if (sent !== false) setComposerContext(null);
    return sent;
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
        onReplyMessage={(message) => {
          setComposerContext({ mode: 'reply', message });
        }}
        onEditMessage={(message) => {
          setComposerContext({ mode: 'edit', message });
        }}
        onDeleteMessage={(message) => {
          onDeleteMessage?.(message.id);
          if (composerContext?.message.id === message.id) {
            setComposerContext(null);
          }
        }}
        onToggleReaction={(message, emoji) => {
          onToggleReaction?.(message.id, emoji);
        }}
      />

      <Composer
        key={composerContext
          ? `${composerContext.mode}:${composerContext.message.id}`
          : 'message'}
        onSend={submitComposer}
        context={composerContext}
        onCancelContext={() => setComposerContext(null)}
      />
    </section>
  );
}

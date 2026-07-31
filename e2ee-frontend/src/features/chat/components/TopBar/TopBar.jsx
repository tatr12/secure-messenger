import { useState } from 'react';
import {
  Archive,
  ArchiveRestore,
  Bell,
  BellOff,
  MoreHorizontal,
  Phone,
  Pin,
  PinOff,
  Search,
  UserRound,
  Video,
} from 'lucide-react';

import './TopBar.css';

export default function TopBar({
  displayName,
  username,
  status = 'В сети',
  searchOpen = false,
  onToggleSearch,
  onAudioCall,
  onVideoCall,
  onOpenProfile,
  chatPreference = {},
  preferenceSaving = false,
  onTogglePin,
  onToggleMute,
  onToggleArchive,
}) {
  const [moreOpen, setMoreOpen] = useState(false);
  const visibleName = displayName || username || 'Собеседник';

  const runMenuAction = (action) => {
    setMoreOpen(false);
    action();
  };

  return (
    <header className="topbar">
      <button
        className="topbar__user"
        type="button"
        title="Посмотреть профиль"
        onClick={onOpenProfile}
      >
        <div className="topbar__avatar">
          {visibleName[0].toUpperCase()}
          <span className="topbar__online" />
        </div>

        <div className="topbar__identity">
          <strong>{visibleName}</strong>
          <span>{status}</span>
        </div>
      </button>

      <div className="topbar__actions">
        <button
          className={`topbar__icon-button ${searchOpen ? 'is-active' : ''}`}
          type="button"
          aria-label="Поиск по сообщениям"
          title="Поиск по сообщениям"
          onClick={onToggleSearch}
        >
          <Search size={19} strokeWidth={1.8} />
        </button>

        <button
          className="topbar__icon-button"
          type="button"
          aria-label="Аудиозвонок"
          title="Аудиозвонок"
          onClick={onAudioCall}
        >
          <Phone size={19} strokeWidth={1.8} />
        </button>

        <button
          className="topbar__icon-button"
          type="button"
          aria-label="Видеозвонок"
          title="Видеозвонок"
          onClick={onVideoCall}
        >
          <Video size={20} strokeWidth={1.8} />
        </button>

        <div className="topbar__menu-wrap">
          <button
            className={`topbar__icon-button ${moreOpen ? 'is-active' : ''}`}
            type="button"
            aria-label="Действия чата"
            title="Действия чата"
            aria-expanded={moreOpen}
            onClick={() => setMoreOpen((current) => !current)}
          >
            <MoreHorizontal size={21} strokeWidth={1.8} />
          </button>

          {moreOpen && (
            <div className="topbar__menu" role="menu">
              <button
                type="button"
                role="menuitem"
                onClick={() => runMenuAction(onOpenProfile)}
              >
                <UserRound size={17} />
                Посмотреть профиль
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => runMenuAction(onToggleSearch)}
              >
                <Search size={17} />
                Найти сообщение
              </button>
              <div className="topbar__menu-divider" role="separator" />
              <button
                type="button"
                role="menuitem"
                disabled={preferenceSaving}
                onClick={() => runMenuAction(onTogglePin)}
              >
                {chatPreference.pinned ? <PinOff size={17} /> : <Pin size={17} />}
                {chatPreference.pinned ? 'Открепить чат' : 'Закрепить чат'}
              </button>
              <button
                type="button"
                role="menuitem"
                disabled={preferenceSaving}
                onClick={() => runMenuAction(onToggleMute)}
              >
                {chatPreference.muted ? <Bell size={17} /> : <BellOff size={17} />}
                {chatPreference.muted
                  ? 'Включить уведомления'
                  : 'Выключить уведомления'}
              </button>
              <button
                type="button"
                role="menuitem"
                disabled={preferenceSaving}
                onClick={() => runMenuAction(onToggleArchive)}
              >
                {chatPreference.archived
                  ? <ArchiveRestore size={17} />
                  : <Archive size={17} />}
                {chatPreference.archived ? 'Вернуть из архива' : 'В архив'}
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

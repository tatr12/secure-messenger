import { useState } from 'react';
import {
  MoreHorizontal,
  Phone,
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
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

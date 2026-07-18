import {
  Search,
  Phone,
  Video,
  MoreHorizontal,
} from 'lucide-react';

import './TopBar.css';

export default function TopBar({
  name = 'Александр',
  status = 'В сети',
  avatar = 'А',
}) {
  return (
    <header className="topbar">
      <div className="topbar__user">
        <div className="topbar__avatar">
          {avatar}
          <span className="topbar__online" />
        </div>

        <div className="topbar__identity">
          <strong>{name}</strong>
          <span>{status}</span>
        </div>
      </div>

      <div className="topbar__actions">
        <button type="button" aria-label="Поиск" title="Поиск">
          <Search size={19} strokeWidth={1.8} />
        </button>

        <button type="button" aria-label="Аудиозвонок" title="Аудиозвонок">
          <Phone size={19} strokeWidth={1.8} />
        </button>

        <button type="button" aria-label="Видеозвонок" title="Видеозвонок">
          <Video size={20} strokeWidth={1.8} />
        </button>

        <button type="button" aria-label="Ещё" title="Ещё">
          <MoreHorizontal size={21} strokeWidth={1.8} />
        </button>
      </div>
    </header>
  );
}
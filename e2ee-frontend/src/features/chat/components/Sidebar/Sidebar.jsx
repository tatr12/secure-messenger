import {
  MessageCircle,
  Users,
  Phone,
  Folder,
  Settings,
  User,
} from 'lucide-react';

import './Sidebar.css';

const navigationItems = [
  { id: 'chats', label: 'Чаты', icon: MessageCircle },
  { id: 'groups', label: 'Группы', icon: Users },
  { id: 'calls', label: 'Звонки', icon: Phone },
  { id: 'files', label: 'Файлы', icon: Folder },
];

export default function Sidebar({
  activeSection = 'chats',
  onSectionChange,
  onOpenSettings,
  onOpenAccount,
}) {
  return (
    <aside className="sidebar">
      <div className="sidebar__brand">VØ</div>

      <nav className="sidebar__navigation" aria-label="Основная навигация">
        {navigationItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeSection === item.id;

          return (
            <button
              key={item.id}
              className={`sidebar__button ${isActive ? 'is-active' : ''}`}
              type="button"
              title={item.label}
              aria-label={item.label}
              onClick={() => onSectionChange?.(item.id)}
            >
              <Icon size={20} strokeWidth={1.8} />
            </button>
          );
        })}
      </nav>

      <div className="sidebar__footer">
        <button
          className="sidebar__button"
          type="button"
          title="Настройки"
          aria-label="Настройки"
          onClick={onOpenSettings}
        >
          <Settings size={20} strokeWidth={1.8} />
        </button>

        <button
          className="sidebar__profile"
          type="button"
          title="Профиль"
          aria-label="Профиль"
          onClick={onOpenAccount}
        >
          <User size={18} strokeWidth={1.8} />
        </button>
      </div>
    </aside>
  );
}

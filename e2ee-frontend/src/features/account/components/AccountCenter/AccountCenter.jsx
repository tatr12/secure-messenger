import { useEffect, useState } from 'react';
import {
  ChevronRight,
  MonitorSmartphone,
  Pencil,
  Settings,
  ShieldCheck,
  UserRound,
  X,
} from 'lucide-react';

import './AccountCenter.css';

const viewDetails = {
  profile: {
    eyebrow: 'Аккаунт',
    title: 'Профиль',
    description: 'Ваши данные в VØIDEN',
  },
  settings: {
    eyebrow: 'Аккаунт',
    title: 'Настройки',
    description: 'Профиль и безопасность',
  },
  sessions: {
    eyebrow: 'Безопасность',
    title: 'Устройства и сессии',
    description: 'Устройства, на которых выполнен вход в VØIDEN',
  },
};

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

export default function AccountCenter({
  initialView = 'profile',
  profile,
  sessions = [],
  sessionsLoading = false,
  onClose,
  onLoadSessions,
  onRevokeSession,
  onSaveProfile,
}) {
  const [activeView, setActiveView] = useState(initialView);
  const [draftName, setDraftName] = useState(profile.displayName || '');
  const [draftBio, setDraftBio] = useState(profile.bio || '');
  const [savingProfile, setSavingProfile] = useState(false);
  const [revokingSessionId, setRevokingSessionId] = useState(null);
  const details = viewDetails[activeView];

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const openView = (view) => {
    setActiveView(view);
    if (view === 'sessions') onLoadSessions();
  };

  const handleProfileSubmit = async (event) => {
    event.preventDefault();
    if (!draftName.trim() || savingProfile) return;

    setSavingProfile(true);
    try {
      const saved = await onSaveProfile(draftName.trim(), draftBio.trim());
      if (saved) setActiveView('profile');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleSessionRevoke = async (sessionId) => {
    if (revokingSessionId) return;

    setRevokingSessionId(sessionId);
    try {
      await onRevokeSession(sessionId);
    } finally {
      setRevokingSessionId(null);
    }
  };

  return (
    <div className="account-center__overlay" onClick={onClose}>
      <section
        className="account-center"
        role="dialog"
        aria-modal="true"
        aria-labelledby="account-center-title"
        onClick={(event) => event.stopPropagation()}
      >
        <aside className="account-center__navigation">
          <div className="account-center__mark">VØ</div>
          <nav aria-label="Разделы аккаунта">
            <button
              className={activeView === 'profile' ? 'is-active' : ''}
              type="button"
              onClick={() => openView('profile')}
            >
              <UserRound size={18} />
              Профиль
            </button>
            <button
              className={activeView === 'settings' ? 'is-active' : ''}
              type="button"
              onClick={() => openView('settings')}
            >
              <Settings size={18} />
              Настройки
            </button>
            <button
              className={activeView === 'sessions' ? 'is-active' : ''}
              type="button"
              onClick={() => openView('sessions')}
            >
              <MonitorSmartphone size={18} />
              Сессии
            </button>
          </nav>
        </aside>

        <div className="account-center__content">
          <header className="account-center__heading">
            <div>
              <span>{details.eyebrow}</span>
              <h2 id="account-center-title">{details.title}</h2>
              <p>{details.description}</p>
            </div>
            <button
              className="account-center__close"
              type="button"
              aria-label="Закрыть"
              onClick={onClose}
            >
              <X size={19} />
            </button>
          </header>

          {activeView === 'profile' && (
            <div className="account-profile">
              <div className="account-profile__hero">
                <div className="account-profile__avatar">
                  {profile.displayName?.[0] || profile.username?.[0] || 'V'}
                </div>
                <div>
                  <h3>{profile.displayName || profile.username}</h3>
                  <p>@{profile.username}</p>
                  <span>● В сети</span>
                </div>
              </div>

              <dl className="account-profile__details">
                <div>
                  <dt>О себе</dt>
                  <dd>{profile.bio || 'Описание не заполнено'}</dd>
                </div>
                <div>
                  <dt>Email</dt>
                  <dd>{profile.email || 'Не указан'}</dd>
                </div>
              </dl>

              <div className="account-center__actions">
                <button type="button" onClick={() => openView('settings')}>
                  <Pencil size={17} />
                  Редактировать профиль
                </button>
                <button type="button" onClick={() => openView('sessions')}>
                  <MonitorSmartphone size={17} />
                  Устройства и сессии
                </button>
              </div>
            </div>
          )}

          {activeView === 'settings' && (
            <form className="account-settings" onSubmit={handleProfileSubmit}>
              <div className="account-settings__section">
                <div className="account-settings__section-heading">
                  <div className="account-settings__icon">
                    <UserRound size={18} />
                  </div>
                  <div>
                    <h3>Публичный профиль</h3>
                    <p>Эти данные видят ваши собеседники</p>
                  </div>
                </div>

                <label>
                  Отображаемое имя
                  <input
                    type="text"
                    maxLength={80}
                    value={draftName}
                    onChange={(event) => setDraftName(event.target.value)}
                    autoComplete="name"
                    required
                  />
                </label>

                <label>
                  О себе
                  <textarea
                    maxLength={255}
                    rows={4}
                    value={draftBio}
                    onChange={(event) => setDraftBio(event.target.value)}
                  />
                  <span>{draftBio.length}/255</span>
                </label>

                <button
                  className="account-settings__save"
                  type="submit"
                  disabled={!draftName.trim() || savingProfile}
                >
                  {savingProfile ? 'Сохранение…' : 'Сохранить изменения'}
                </button>
              </div>

              <button
                className="account-settings__security"
                type="button"
                onClick={() => openView('sessions')}
              >
                <span className="account-settings__icon">
                  <ShieldCheck size={18} />
                </span>
                <span>
                  <strong>Безопасность аккаунта</strong>
                  <small>Активные устройства и завершение сессий</small>
                </span>
                <ChevronRight size={18} />
              </button>
            </form>
          )}

          {activeView === 'sessions' && (
            <div className="account-sessions">
              {sessionsLoading && (
                <div className="account-sessions__empty">Загрузка…</div>
              )}

              {!sessionsLoading && sessions.length === 0 && (
                <div className="account-sessions__empty">
                  Активные сессии не найдены
                </div>
              )}

              {!sessionsLoading &&
                sessions.map((session) => (
                  <article className="account-session" key={session.id}>
                    <div className="account-session__icon">
                      <MonitorSmartphone size={19} />
                    </div>
                    <div className="account-session__details">
                      <div className="account-session__name">
                        {sessionDeviceName(session.user_agent)}
                        {session.current && <span>Текущая</span>}
                      </div>
                      <div className="account-session__time">
                        Активность: {sessionLastUsed(session.last_used_at)}
                      </div>
                    </div>
                    {!session.current && (
                      <button
                        className="account-session__revoke"
                        type="button"
                        disabled={revokingSessionId === session.id}
                        onClick={() => handleSessionRevoke(session.id)}
                      >
                        {revokingSessionId === session.id
                          ? 'Завершение…'
                          : 'Завершить'}
                      </button>
                    )}
                  </article>
                ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

import { useEffect } from 'react';
import { MessageCircle, ShieldCheck, X } from 'lucide-react';

import './PartnerProfileDialog.css';

export default function PartnerProfileDialog({ profile, onClose }) {
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div className="partner-profile__overlay" onClick={onClose}>
      <section
        className="partner-profile"
        role="dialog"
        aria-modal="true"
        aria-labelledby="partner-profile-title"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          className="partner-profile__close"
          type="button"
          aria-label="Закрыть профиль"
          onClick={onClose}
        >
          <X size={18} />
        </button>

        <div className="partner-profile__avatar">
          {profile.display_name?.[0] || profile.username?.[0] || 'V'}
          <span className={profile.is_online ? 'is-online' : ''} />
        </div>

        <h2 id="partner-profile-title">
          {profile.display_name || profile.username}
        </h2>
        <p className="partner-profile__username">@{profile.username}</p>
        <p className="partner-profile__status">
          {profile.is_online ? '● В сети' : 'Не в сети'}
        </p>

        <div className="partner-profile__bio">
          <span>О себе</span>
          <p>{profile.bio || 'Описание не заполнено'}</p>
        </div>

        <div className="partner-profile__security">
          <ShieldCheck size={18} />
          <div>
            <strong>Защищённый диалог</strong>
            <span>Сообщения шифруются на вашем устройстве</span>
          </div>
        </div>

        <button
          className="partner-profile__message"
          type="button"
          onClick={onClose}
        >
          <MessageCircle size={17} />
          Вернуться к сообщениям
        </button>
      </section>
    </div>
  );
}

import React, { useEffect, useRef, useState } from 'react';
import { useMessenger } from './useMessenger';

export default function App() {
  const m = useMessenger();
  const messagesEndRef = useRef(null);
  const [newNickInput, setNewNickInput] = useState('');
  const [newBioInput, setNewBioInput] = useState('');
  const [verificationStatus, setVerificationStatus] = useState(null);
  const [verificationError, setVerificationError] = useState(null);
  const [verificationLoading, setVerificationLoading] = useState(false);

  // Handle verify token from frontend URL /verify?token=...
  useEffect(() => {
    if (window.location.pathname !== '/verify') return;

    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    if (!token) {
      setVerificationError('Токен подтверждения не найден в URL.');
      return;
    }

    const verifyEmail = async () => {
      setVerificationLoading(true);
      try {
        const res = await fetch(`http://127.0.0.2:8000/verify?token=${encodeURIComponent(token)}`);
        const data = await res.json();
        if (!res.ok) {
          setVerificationError(data.error || 'Ошибка при подтверждении email.');
          return;
        }
        setVerificationStatus(data.message || 'Email успешно подтвержден.');
        window.history.replaceState(null, '', '/');
      } catch (err) {
        setVerificationError('Не удалось связаться с сервером при подтверждении.');
      } finally {
        setVerificationLoading(false);
      }
    };

    verifyEmail();
  }, []);

  // Вешаем уведомление на успешный вход/регистрацию из хука
  useEffect(() => {
    if (m.isLoggedIn) {
      m.showNotification(`Терминал инициализирован. Добро пожаловать, ${m.displayName}`, 'success');
      // Инициализируем WebSocket при логине
      m.initWebSocket(m.username);
    }
  }, [m.isLoggedIn]);

  // 1. Для автопрокрутки при появлении сообщений
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [m.allMessages]);

  // 2. Для отправки отчетов о прочтении
  useEffect(() => {
    if (m.isLoggedIn && m.activeChatUser && m.wsStatus === 'online') {
      m.sendReadReceipt(m.activeChatUser);
    }
  }, [m.activeChatUser, m.allMessages.length, m.wsStatus, m.isLoggedIn]);

  useEffect(() => {
    if (m.isProfileOpen) {
      setNewNickInput(m.displayName);
      setNewBioInput(m.bio);
    }
  }, [m.isProfileOpen]);

  const styles = {
    container: { display: 'flex', height: '100vh', width: '100vw', background: '#050505', color: '#e5e5e5', fontFamily: 'Courier New, Courier, monospace' },
    authContainer: { margin: 'auto', width: 350, background: '#0a0a0f', border: '2px solid #ff0033', boxShadow: '0 0 20px rgba(25, 0, 51, 0.7)', borderRadius: 4, overflow: 'hidden' },
    authTabs: { display: 'flex', borderBottom: '1px solid #1a1a24' },
    tab: (active) => ({ flex: 1, padding: 15, background: active ? '#111' : '#050505', border: 'none', color: active ? '#ff0033' : '#555', fontWeight: 'bold', cursor: 'pointer', fontSize: 13, textTransform: 'uppercase' }),
    authBox: { padding: 30, display: 'flex', flexDirection: 'column', gap: 15 },
    input: { padding: 12, borderRadius: 2, border: '1px solid #222', background: '#0d0d0d', color: '#ff0033', outline: 'none', fontFamily: 'monospace' },
    btn: { padding: 12, borderRadius: 2, border: '1px solid #ff0033', background: '#ff0033', color: '#000', fontWeight: 'bold', cursor: 'pointer', textTransform: 'uppercase' },
    sidebar: { width: 300, borderRight: '1px solid #1a1a24', display: 'flex', flexDirection: 'column', background: '#0a0a0f' },
    mainChat: { flex: 1, display: 'flex', flexDirection: 'column', background: '#030305' },
    chatItem: (isActive) => ({ padding: '14px 20px', background: isActive ? '#140508' : 'transparent', borderLeft: isActive ? '4px solid #ff0033' : '4px solid transparent', cursor: 'pointer', borderBottom: '1px solid #111' }),
    bubble: (isMe) => ({ alignSelf: isMe ? 'flex-end' : 'flex-start', background: isMe ? '#1a0508' : '#0f0f14', border: isMe ? '1px solid #ff0033' : '1px solid #222', padding: '11px 15px', borderRadius: 4, maxWidth: '65%', wordBreak: 'break-word' }),
    badge: (isOnline) => ({ width: 8, height: 8, borderRadius: '50%', background: isOnline ? '#00ff66' : '#ff0033', display: 'inline-block', marginLeft: 8 }),
    modal: { position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 },
    avatarPlaceholder: { width: 90, height: 90, borderRadius: '50%', border: '2px dashed #ff0033', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 10px auto', color: '#333', fontSize: 12 },
    infoBlock: { background: '#050508', border: '1px solid #111', padding: 12, borderRadius: 2, display: 'flex', flexDirection: 'column', gap: 4, textAlign: 'left' },
    searchDropdown: { position: 'absolute', top: '100%', left: 15, right: 15, background: '#0d0d13', border: '1px solid #ff0033', zIndex: 50, borderRadius: 2, overflow: 'hidden', boxShadow: '0 5px 15px rgba(0,0,0,0.8)' },
    searchResultItem: { padding: '10px 15px', borderBottom: '1px solid #1a1a24', cursor: 'pointer', display: 'flex', flexDirection: 'column' },
    onlineText: (isOnline) => ({ fontSize: 11, color: isOnline ? '#00ff66' : '#555', textTransform: 'uppercase', display: 'block', marginTop: 2 }),
    
    // Стили для контейнера тостов
    toastContainer: { position: 'fixed', bottom: 24, right: 24, zIndex: 9999, display: 'flex', flexDirection: 'column', gap: 12 },
    toast: (type, fadeOut) => ({
      background: '#0a0a0f',
      color: '#e5e5e5',
      padding: '14px 20px',
      borderRadius: 2,
      border: '1px solid #222',
      borderLeft: `4px solid ${type === 'success' ? '#00ff66' : type === 'chat' ? '#ff0033' : '#00bcff'}`,
      boxShadow: '0 0 15px rgba(0,0,0,0.7)',
      fontFamily: 'monospace',
      fontSize: 12,
      minWidth: 280,
      maxWidth: 360,
      position: 'relative',
      transform: fadeOut ? 'translateX(150%)' : 'translateX(0)',
      opacity: fadeOut ? 0 : 1,
      transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
    }),
    toastClose: { position: 'absolute', top: 6, right: 10, background: 'none', border: 'none', color: '#555', cursor: 'pointer', fontSize: 14, fontWeight: 'bold' }
  };

  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    try {
      await m.handleAuth(e);
    } catch (err) {
      m.showNotification('ОШИБКА АВТОРИЗАЦИИ РЕЕСТРА', 'error');
    }
  };

  if (!m.isLoggedIn) {
    return (
      <div style={styles.container}>
        <div style={styles.authContainer}>
          <div style={styles.authTabs}>
            <button style={styles.tab(!m.isRegMode)} onClick={() => m.setIsRegMode(false)}>Вход</button>
            <button style={styles.tab(m.isRegMode)} onClick={() => m.setIsRegMode(true)}>Регистрация</button>
          </div>
          {(verificationLoading || verificationStatus || verificationError) && (
            <div style={{ padding: '0 30px', textAlign: 'center', fontSize: 12, color: '#fff' }}>
              {verificationLoading && <div style={{ color: '#00ff66', marginBottom: 10 }}>Проверка токена...</div>}
              {verificationStatus && <div style={{ color: '#00ff66', marginBottom: 10 }}>{verificationStatus}</div>}
              {verificationError && <div style={{ color: '#ff0033', marginBottom: 10 }}>{verificationError}</div>}
            </div>
          )}
          <form style={styles.authBox} onSubmit={handleAuthSubmit}>
            <div style={{ textAlign: 'center', fontSize: 20, fontWeight: 'bold', color: '#ff0033', letterSpacing: '2px' }}>💀 СМЕРТЬ В НИЩЕТЕ</div>
            <input style={styles.input} placeholder="УНИКАЛЬНЫЙ ЛОГИН" value={m.username} onChange={e => m.setUsername(e.target.value)} />
            {m.isRegMode && <input style={styles.input} placeholder="ОТОБРАЖАЕМОЕ ИМЯ" value={m.displayName} onChange={e => m.setDisplayName(e.target.value)} />}
            {m.isRegMode && <input style={styles.input} placeholder="EMAIL ДЛЯ ВЕРИФИКАЦИИ" type="email" value={m.email} onChange={e => m.setEmail(e.target.value)} />}
            <input style={styles.input} type="password" placeholder="ПИН-КОД ЗАКРЫТОГО КЛЮЧА" value={m.password} onChange={e => m.setPassword(e.target.value)} />
            {m.isRegMode && <input style={styles.input} type="password" placeholder="ПОДТВЕРЖДЕНИЕ ПИН-КОДА" value={m.confirmPassword} onChange={e => m.setConfirmPassword(e.target.value)} />}
            <button style={styles.btn} type="submit">{m.isRegMode ? 'Создать терминал' : 'Инициализировать'}</button>
          </form>
        </div>

        {/* 🔴 КОНТЕЙНЕР ДЛЯ ПУШЕЙ НА ЭКРАНЕ АВТОРИЗАЦИИ */}
        <div style={styles.toastContainer}>
          {m.toasts.map((toast) => (
            <div key={toast.id} style={styles.toast(toast.type, toast.fadeOut)}>
              <button style={styles.toastClose} onClick={() => m.dismissToast(toast.id)}>×</button>
              {toast.title && (
                <div style={{ color: '#ff0033', fontWeight: 'bold', marginBottom: 4, fontSize: 11, textTransform: 'uppercase' }}>
                  Входящий пакет [{toast.title}]:
                </div>
              )}
              <span style={{ wordBreak: 'break-word', paddingRight: 10 }}>{toast.message}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>

      {/* 🛠️ ОКНО СОБСТВЕННОГО ПРОФИЛЯ */}
      {m.isProfileOpen && (
        <div style={styles.modal}>
          <div style={{ ...styles.authContainer, width: 380, padding: 25, display: 'flex', flexDirection: 'column', gap: 16, textAlign: 'center' }}>
            <div style={styles.avatarPlaceholder}>[ NO PHOTO ]</div>
            <div style={{ fontSize: 22, fontWeight: 'bold', color: '#ff0033' }}>{m.displayName}</div>
            <div style={styles.infoBlock}>
              <span style={{ fontSize: 10, color: '#444' }}>СИСТЕМНЫЙ ID</span>
              <span style={{ color: '#ff0033', fontSize: 14, fontWeight: 'bold' }}>#{m.userId || 'GEN_1'}</span>
            </div>
            <div style={styles.infoBlock}>
              <span style={{ fontSize: 10, color: '#444' }}>СИСТЕМНЫЙ АДРЕС</span>
              <span style={{ color: '#aaa', fontSize: 14 }}>@{m.username}</span>
            </div>
            <div style={styles.infoBlock}>
              <span style={{ fontSize: 10, color: '#444' }}>КАСТОМНЫЙ СТАТУС ({newBioInput.length}/32)</span>
              <span style={{ color: '#888', fontSize: 13, fontStyle: 'italic' }}>«{m.bio}»</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <input style={styles.input} placeholder="Изменить имя профиля..." value={newNickInput} onChange={e => setNewNickInput(e.target.value)} />
              <input style={styles.input} placeholder="Изменить статус..." value={newBioInput} maxLength={32} onChange={e => setNewBioInput(e.target.value)} />
            </div>
            <button style={styles.btn} onClick={async () => {
              try {
                await m.changeProfileData(newNickInput, newBioInput);
                m.setIsProfileOpen(false);
                m.showNotification('Ядро обновлено: данные реестра изменены', 'success');
              } catch(e) {
                m.showNotification('Ошибка обновления данных реестра', 'error');
              }
            }}>Сохранить реестр</button>
            <button style={{ ...styles.btn, background: 'transparent', color: '#ff0033' }} onClick={() => m.setIsProfileOpen(false)}>Закрыть</button>
          </div>
        </div>
      )}

      {/* 👁️ ОКНО ПРОСМОТРА ЧУЖОГО ПРОФИЛЯ */}
      {m.viewingPartnerProfile && (
        <div style={styles.modal}>
          <div style={{ ...styles.authContainer, width: 380, padding: 25, display: 'flex', flexDirection: 'column', gap: 16, textAlign: 'center' }}>
            <div style={styles.avatarPlaceholder}>[ NO PHOTO ]</div>
            <div style={{ fontSize: 22, fontWeight: 'bold', color: '#ff0033' }}>{m.viewingPartnerProfile.display_name}</div>
            <div style={styles.infoBlock}>
              <span style={{ fontSize: 10, color: '#444' }}>СИСТЕМНЫЙ ID ПОЛЬЗОВАТЕЛЯ</span>
              <span style={{ color: '#aaa', fontSize: 14, fontWeight: 'bold' }}>#{m.viewingPartnerProfile.id || 'GEN_X'}</span>
            </div>
            <div style={styles.infoBlock}>
              <span style={{ fontSize: 10, color: '#444' }}>СЕТЕВОЙ СТАТУС</span>
              <span style={{ color: m.viewingPartnerProfile.is_online ? '#00ff66' : '#ff0033', fontWeight: 'bold' }}>
                {m.viewingPartnerProfile.is_online ? '● В СЕТИ' : '○ ОФФЛАЙН'}
              </span>
            </div>
            <div style={styles.infoBlock}>
              <span style={{ fontSize: 10, color: '#444' }}>СИСТЕМНЫЙ АДРЕС</span>
              <span style={{ color: '#aaa', fontSize: 14 }}>@{m.viewingPartnerProfile.username}</span>
            </div>
            <div style={styles.infoBlock}>
              <span style={{ fontSize: 10, color: '#444' }}>СТАТУС ПОЛЬЗОВАТЕЛЯ</span>
              <span style={{ color: '#888', fontSize: 13, fontStyle: 'italic' }}>«{m.viewingPartnerProfile.bio}»</span>
            </div>
            <button style={styles.btn} onClick={() => m.setViewingPartnerProfile(null)}>Закрыть профиль</button>
          </div>
        </div>
      )}

      {/* ЛЕВАЯ ПАНЕЛЬ */}
      <div style={styles.sidebar}>
        <div style={{ padding: 20, borderBottom: '1px solid #1a1a24', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#07070a' }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 'bold', color: '#ff0033', cursor: 'pointer' }} onClick={() => m.setIsProfileOpen(true)}>
              {m.displayName} <span style={styles.badge(m.wsStatus === 'online')} />
            </div>
            <div style={{ fontSize: 10, color: '#555' }}>@{m.username} (ID: #{m.userId || '1'})</div>
          </div>
          <button onClick={() => { m.logout(); m.showNotification('Сессия terminala разорвана', 'info'); }} style={{ background: 'none', border: 'none', color: '#555', fontSize: 11, cursor: 'pointer' }}>[ВЫХОД]</button>
        </div>

        {/* ЖИВОЙ ПОИСК */}
        <div style={{ padding: 15, borderBottom: '1px solid #1a1a24', position: 'relative' }}>
          <input
            style={{ ...styles.input, padding: 10, width: '100%', boxSizing: 'border-box', fontSize: 13 }}
            placeholder="Поиск контактов в сети..."
            value={m.searchQuery}
            onChange={e => m.setSearchQuery(e.target.value)}
          />
          {m.searchResults.length > 0 && (
            <div style={styles.searchDropdown}>
              {m.searchResults.map(user => (
                <div
                  key={user.username}
                  style={styles.searchResultItem}
                  onClick={() => { m.tryStartChat(user.username); m.showNotification(`Подключение к каналу @${user.username}`, 'info'); }}
                  onMouseEnter={(e) => e.currentTarget.style.background = '#1a0508'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                >
                  <span style={{ color: '#ff0033', fontWeight: 'bold', fontSize: 13 }}>
                    {user.display_name} <span style={styles.badge(user.is_online)} />
                  </span>
                  <span style={{ color: '#555', fontSize: 11 }}>@{user.username}</span>
                </div>
              ))}
            </div>
          )}
          {m.searchQuery && m.searchResults.length === 0 && (
            <div style={{ ...styles.searchDropdown, padding: 12, color: '#444', fontSize: 11, textAlign: 'center' }}>НЕТ СОВПАДЕНИЙ</div>
          )}
        </div>
        
        <div style={{ padding: '10px 20px', fontSize: 11, color: '#333', borderBottom: '1px solid #1a1a24' }}>ОТКРЫТЫЕ КАНАЛЫ</div>
        
        {/* СПИСОК ЧАТОВ */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {m.chatPartners.map(partner => (
            <div key={partner} style={styles.chatItem(partner === m.activeChatUser)} onClick={() => m.setActiveChatUser(partner)}>
              <div style={{ color: partner === m.activeChatUser ? '#ff0033' : '#aaa', fontSize: 14 }}>
                {m.userCache[partner] || partner}
              </div>
              <div style={{ fontSize: 10, color: '#444' }}>@{partner}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ПРАВАЯ ПАНЕЛЬ ЧАТА */}
      <div style={styles.mainChat}>
        {m.activeChatUser ? (
          <>
            <div
              style={{ padding: 16, borderBottom: '1px solid #1a1a24', background: '#07070a', cursor: 'pointer' }}
              onClick={() => m.inspectPartnerProfile(m.activeChatUser)}
            >
              КАНАЛ СВЯЗИ: <b style={{ color: '#ff0033' }}>{m.userCache[m.activeChatUser] || m.activeChatUser}</b>
              <span style={{ fontSize: 11, color: '#444', marginLeft: 6 }}>@{m.activeChatUser} (Нажмите для инфо)</span>
            </div>

            <div style={{ flex: 1, padding: 20, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
              {m.allMessages.filter(msg => (msg.from === m.username && msg.to === m.activeChatUser) || (msg.from === m.activeChatUser && msg.to === m.username)).map(msg => {
                const isMe = msg.from === m.username;
                return (
                  <div key={msg.id} style={styles.bubble(isMe)}>
                    <div style={{ color: isMe ? '#ff0033' : '#eee' }}>{msg.text}</div>
                    <div style={{ fontSize: 9, color: '#444', marginTop: 5, textAlign: 'right', display: 'flex', justifyContent: 'flex-end', gap: 5 }}>
                      {msg.time}
                      {isMe && (msg.status === 'pending' ? '⏳' : msg.status === 'read' ? <span style={{ color: '#00ff66', fontWeight: 'bold' }}>✓✓</span> : <span style={{ color: '#555' }}>✓</span>)}
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>
            <form style={{ padding: 20, borderTop: '1px solid #1a1a24', display: 'flex', gap: 10, background: '#07070a' }} onSubmit={(e) => { e.preventDefault(); m.sendMessage(m.activeChatUser); }}>
              <input style={{ ...styles.input, flex: 1 }} placeholder="Шифрованный поток данных..." value={m.message} onChange={e => m.setMessage(e.target.value)} />
              <button style={styles.btn} type="submit">ПЕРЕДАТЬ</button>
            </form>
          </>
        ) : (
          <div style={{ margin: 'auto', textAlign: 'center', color: '#222' }}>
            <div style={{ fontSize: 40, marginBottom: 10 }}>💀</div>
            <div>СИСТЕМА ОЖИДАНИЯ ПОДКЛЮЧЕНИЯ</div>
          </div>
        )}
      </div>

      {/* 🔴 МОДЕРНИЗИРОВАННЫЙ КИБЕРПАНК КОНТЕЙНЕР ДЛЯ ПУШЕЙ */}
      <div style={styles.toastContainer}>
        {m.toasts.map((toast) => (
          <div key={toast.id} style={styles.toast(toast.type, toast.fadeOut)}>
            {/* Кнопка ручного закрытия "крестик" */}
            <button style={styles.toastClose} onClick={() => m.dismissToast(toast.id)}>×</button>
            
            {/* Если это пуш чата, выведем жирный заголовок отправителя */}
            {toast.title && (
              <div style={{ color: '#ff0033', fontWeight: 'bold', marginBottom: 4, fontSize: 11, textTransform: 'uppercase' }}>
                Входящий пакет [{toast.title}]:
              </div>
            )}
            <span style={{ wordBreak: 'break-word', paddingRight: 10 }}>{toast.message}</span>
          </div>
        ))}
      </div>

    </div>
  );
}
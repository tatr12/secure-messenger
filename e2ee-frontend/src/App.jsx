import React, { useEffect, useRef, useState } from 'react';
import { useMessenger } from './useMessenger';
import LoginPage from './pages/Login/LoginPage';
import ChatPage from './pages/Chat/ChatPage';

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
        const res = await fetch(`/verify?token=${encodeURIComponent(token)}`);
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
    container: {
      display: 'flex',
      minHeight: '100vh',
      width: '100vw',
      background:
        'radial-gradient(circle at top left, rgba(0,122,255,0.10), transparent 32%), radial-gradient(circle at bottom right, rgba(175,82,222,0.08), transparent 30%), #f5f5f7',
      color: '#1d1d1f',
      fontFamily:
        '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", sans-serif',
    },

    authContainer: {
      margin: 'auto',
      width: 420,
      background: 'rgba(255,255,255,0.82)',
      border: '1px solid rgba(255,255,255,0.9)',
      boxShadow: '0 24px 70px rgba(0,0,0,0.12)',
      borderRadius: 24,
      overflow: 'hidden',
      backdropFilter: 'blur(24px)',
    },

    authTabs: {
      display: 'flex',
      borderBottom: '1px solid rgba(0,0,0,0.08)',
    },

    tab: (active) => ({
      flex: 1,
      padding: '18px 16px',
      background: active ? 'rgba(0,122,255,0.10)' : 'transparent',
      border: 'none',
      color: active ? '#007aff' : '#86868b',
      fontWeight: 600,
      cursor: 'pointer',
      fontSize: 14,
    }),

    authBox: {
      padding: 36,
      display: 'flex',
      flexDirection: 'column',
      gap: 16,
    },

    input: {
      padding: '15px 16px',
      borderRadius: 14,
      border: '1px solid #d2d2d7',
      background: 'rgba(255,255,255,0.95)',
      color: '#1d1d1f',
      outline: 'none',
      fontFamily: 'inherit',
      fontSize: 15,
    },

    btn: {
      padding: '15px 18px',
      borderRadius: 14,
      border: 'none',
      background: '#007aff',
      color: '#ffffff',
      fontWeight: 600,
      cursor: 'pointer',
      fontSize: 15,
    },
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
      <LoginPage
        isRegister={m.isRegMode}
        username={m.username}
        email={m.email}
        password={m.password}
        confirmPassword={m.confirmPassword}
        onUsernameChange={(event) => m.setUsername(event.target.value)}
        onEmailChange={(event) => m.setEmail(event.target.value)}
        onPasswordChange={(event) => m.setPassword(event.target.value)}
        onConfirmPasswordChange={(event) =>
          m.setConfirmPassword(event.target.value)
        }
        onSubmit={handleAuthSubmit}
        onSwitchMode={m.setIsRegMode}
        verificationLoading={verificationLoading}
        verificationStatus={verificationStatus}
        verificationError={verificationError}
      />
    );
  }

  return <ChatPage messenger={m} />;
}

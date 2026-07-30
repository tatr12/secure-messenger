import { useEffect, useRef, useState } from 'react';
import { useMessenger } from './useMessenger';
import LoginPage from './pages/Login/LoginPage';
import ChatPage from './pages/Chat/ChatPage';

export default function App() {
  const m = useMessenger();
  const messagesEndRef = useRef(null);
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
        const res = await fetch(`/api/verify?token=${encodeURIComponent(token)}`);
        const data = await res.json();
        if (!res.ok) {
          setVerificationError(data.error || 'Ошибка при подтверждении email.');
          return;
        }
        setVerificationStatus(data.message || 'Email успешно подтвержден.');
        window.history.replaceState(null, '', '/');
      } catch {
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

  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    try {
      await m.handleAuth(e);
    } catch {
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

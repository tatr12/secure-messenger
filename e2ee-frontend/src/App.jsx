import { useEffect, useEffectEvent, useState } from 'react';
import { useMessenger } from './useMessenger';
import LoginPage from './pages/Login/LoginPage';
import ChatPage from './pages/Chat/ChatPage';
import ToastViewport from './ui/ToastViewport/ToastViewport';

export default function App() {
  const m = useMessenger();
  const [verificationStatus, setVerificationStatus] = useState(null);
  const isVerificationRoute = window.location.pathname === '/verify';
  const verificationToken = isVerificationRoute
    ? new URLSearchParams(window.location.search).get('token')
    : null;
  const [verificationError, setVerificationError] = useState(() =>
    isVerificationRoute && !verificationToken
      ? 'Токен подтверждения не найден в URL.'
      : null
  );
  const [verificationLoading, setVerificationLoading] = useState(false);

  // Handle verify token from frontend URL /verify?token=...
  useEffect(() => {
    if (!verificationToken) return;

    const verifyEmail = async () => {
      setVerificationLoading(true);
      try {
        const res = await fetch(
          `/api/verify?token=${encodeURIComponent(verificationToken)}`
        );
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
  }, [verificationToken]);

  const sendActiveChatReadReceipt = useEffectEvent((username) => {
    m.sendReadReceipt(username);
  });

  // Отправляем отчёт о прочтении активного диалога.
  useEffect(() => {
    if (m.isLoggedIn && m.activeChatUser && m.wsStatus === 'online') {
      sendActiveChatReadReceipt(m.activeChatUser);
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

  const activePage = !m.isLoggedIn ? (
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
  ) : (
    <ChatPage messenger={m} />
  );

  return (
    <>
      {activePage}
      <ToastViewport toasts={m.toasts} onDismiss={m.dismissToast} />
    </>
  );
}

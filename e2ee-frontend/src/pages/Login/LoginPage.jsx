import { Button } from '../../ui/Button/Button';
import { Input } from '../../ui/Input/Input';

import './LoginPage.css';

export default function LoginPage({
  isRegister,
  username,
  email,
  password,
  confirmPassword,
  onUsernameChange,
  onEmailChange,
  onPasswordChange,
  onConfirmPasswordChange,
  onSubmit,
  onSwitchMode,
  verificationLoading,
  verificationStatus,
  verificationError,
}) {
  return (
    <main className="login-page">
      <section className="login-card">
        <div className="login-brand">
          <div className="login-brand__title">VØIDEN</div>
          <div className="login-brand__subtitle">
            {isRegister
              ? 'Создайте защищённый аккаунт'
              : 'Войдите, чтобы продолжить'}
          </div>
        </div>

        {(verificationLoading || verificationStatus || verificationError) && (
          <div className="login-status">
            {verificationLoading && <span>Проверка токена…</span>}

            {verificationStatus && (
              <span className="login-status--success">
                {verificationStatus}
              </span>
            )}

            {verificationError && (
              <span className="login-status--error">
                {verificationError}
              </span>
            )}
          </div>
        )}

        <form className="login-form" onSubmit={onSubmit}>
          <Input
            placeholder="Логин"
            value={username}
            onChange={onUsernameChange}
            autoComplete="username"
          />

          {isRegister && (
            <Input
              type="email"
              placeholder="Email"
              value={email}
              onChange={onEmailChange}
              autoComplete="email"
            />
          )}

          <Input
            type="password"
            placeholder="Пароль"
            value={password}
            onChange={onPasswordChange}
            autoComplete={isRegister ? 'new-password' : 'current-password'}
          />

          {isRegister && (
            <Input
              type="password"
              placeholder="Подтвердите пароль"
              value={confirmPassword}
              onChange={onConfirmPasswordChange}
              autoComplete="new-password"
            />
          )}

          <Button type="submit" fullWidth>
            {isRegister ? 'Создать аккаунт' : 'Войти'}
          </Button>
        </form>

        <button
          className="login-switch"
          type="button"
          onClick={() => onSwitchMode(!isRegister)}
        >
          {isRegister
            ? 'Уже есть аккаунт? Войти'
            : 'Нет аккаунта? Создать аккаунт'}
        </button>
      </section>
    </main>
  );
}
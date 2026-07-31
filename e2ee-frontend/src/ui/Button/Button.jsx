import './Button.css';

export function Button({
  children,
  type = 'button',
  variant = 'primary',
  fullWidth = false,
  disabled = false,
  onClick,
}) {
  const className = [
    'ui-button',
    `ui-button--${variant}`,
    fullWidth ? 'ui-button--full' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      className={className}
      type={type}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

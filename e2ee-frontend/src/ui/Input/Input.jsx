import './Input.css';

export function Input({
  label,
  type = 'text',
  value,
  onChange,
  placeholder,
  name,
  autoComplete,
  disabled = false,
  error = '',
}) {
  return (
    <label className="ui-input-field">
      {label && <span className="ui-input-field__label">{label}</span>}

      <input
        className={`ui-input ${error ? 'ui-input--error' : ''}`}
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        name={name}
        autoComplete={autoComplete}
        disabled={disabled}
      />

      {error && <span className="ui-input-field__error">{error}</span>}
    </label>
  );
}

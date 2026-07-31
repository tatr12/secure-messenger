import { X } from 'lucide-react';

import './ToastViewport.css';

export default function ToastViewport({ toasts = [], onDismiss }) {
  if (toasts.length === 0) return null;

  return (
    <section
      className="toast-viewport"
      aria-label="Уведомления"
      aria-live="polite"
    >
      {toasts.map((toast) => (
        <article
          className={`toast-card toast-card--${toast.type} ${
            toast.fadeOut ? 'is-leaving' : ''
          }`}
          key={toast.id}
        >
          <div className="toast-card__content">
            {toast.title && <strong>{toast.title}</strong>}
            <p>{toast.message}</p>
          </div>
          <button
            type="button"
            aria-label="Закрыть уведомление"
            onClick={() => onDismiss(toast.id)}
          >
            <X size={16} />
          </button>
        </article>
      ))}
    </section>
  );
}

import { useState } from 'react';

import {
  Paperclip,
  Smile,
  Send,
  X,
} from 'lucide-react';

import './Composer.css';

export default function Composer({ onSend, context, onCancelContext }) {
  const [text, setText] = useState(
    context?.mode === 'edit' ? context.message.text : '',
  );

  const handleSubmit = (event) => {
    event.preventDefault();

    const value = text.trim();

    if (!value) return;

    const accepted = onSend?.(value);
    if (accepted !== false) setText('');
  };

  return (
    <form
      className="composer"
      onSubmit={handleSubmit}
    >
      {context && (
        <div className="composer__context">
          <div>
            <strong>
              {context.mode === 'edit'
                ? 'Редактирование сообщения'
                : 'Ответ на сообщение'}
            </strong>
            <span>
              {context.message.deleted
                ? 'Сообщение удалено'
                : context.message.text}
            </span>
          </div>
          <button
            type="button"
            aria-label="Отменить действие"
            title="Отменить"
            onClick={() => {
              if (context.mode === 'edit') setText('');
              onCancelContext?.();
            }}
          >
            <X size={17} />
          </button>
        </div>
      )}

      <button 
        type="button" 
        aria-label="Добавить файл" 
        title="Добавить файл"
      >
        <Paperclip size={19} strokeWidth={1.8} />
      </button>

      <label className="composer__field">
        <Smile size={18} strokeWidth={1.8} />

        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={context?.mode === 'edit' ? 'Новый текст...' : 'Сообщение...'}
          aria-label="Сообщение"
          autoFocus={Boolean(context)}
        />
      </label>

      <button
        className="composer__send"
        type="submit"
        aria-label="Отправить"
        title="Отправить"
      >
        <Send size={18} strokeWidth={1.9} />
      </button>
    </form>
  );
}

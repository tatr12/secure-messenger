import { useState } from 'react';

import {
  Paperclip,
  Smile,
  Send,
} from 'lucide-react';

import './Composer.css';

export default function Composer({ onSend }) {
  const [text, setText] = useState('');

  const handleSubmit = (event) => {
    event.preventDefault();

    const value = text.trim();

    if (!value) return;

    onSend?.(value);

    setText('');
  };

  return (
    <form
      className="composer"
      onSubmit={handleSubmit}
    >
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
          placeholder="Сообщение..."
          aria-label="Сообщение"
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

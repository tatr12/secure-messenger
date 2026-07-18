import {
  Paperclip,
  Smile,
  Send,
} from 'lucide-react';

import './Composer.css';

export default function Composer() {
  return (
    <form
      className="composer"
      onSubmit={(event) => event.preventDefault()}
    >
      <button type="button" aria-label="Добавить файл" title="Добавить файл">
        <Paperclip size={19} strokeWidth={1.8} />
      </button>

      <label className="composer__field">
        <Smile size={18} strokeWidth={1.8} />

        <input
          type="text"
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
function parseTimestamp(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function dayKey(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

export function formatMessageTime(timestamp, fallback = '') {
  const date = parseTimestamp(timestamp);
  if (!date) return fallback;
  return new Intl.DateTimeFormat('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function formatMessageDay(timestamp, now = new Date()) {
  const date = parseTimestamp(timestamp);
  if (!date) return 'Без даты';

  const currentDate = parseTimestamp(now) ?? new Date();
  const today = dayKey(currentDate);
  const yesterdayDate = new Date(currentDate);
  yesterdayDate.setDate(currentDate.getDate() - 1);

  if (dayKey(date) === today) return 'Сегодня';
  if (dayKey(date) === dayKey(yesterdayDate)) return 'Вчера';

  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: date.getFullYear() === currentDate.getFullYear()
      ? undefined
      : 'numeric',
  }).format(date);
}

export function groupMessagesByDay(messages, now = new Date()) {
  const groups = [];

  for (const message of messages) {
    const date = parseTimestamp(message.createdAt);
    const key = date ? dayKey(date) : 'unknown';
    const previous = groups.at(-1);

    if (!previous || previous.key !== key) {
      groups.push({
        key,
        label: formatMessageDay(date, now),
        messages: [message],
      });
    } else {
      previous.messages.push(message);
    }
  }

  return groups;
}

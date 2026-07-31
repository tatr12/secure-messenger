import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatMessageDay,
  groupMessagesByDay,
} from './features/chat/messageDates.js';

const now = new Date(2026, 6, 31, 12, 0, 0);

test('message dates distinguish today, yesterday and older days', () => {
  assert.equal(formatMessageDay(new Date(2026, 6, 31, 9), now), 'Сегодня');
  assert.equal(formatMessageDay(new Date(2026, 6, 30, 21), now), 'Вчера');
  assert.match(formatMessageDay(new Date(2026, 5, 12, 10), now), /12 июня/);
});

test('messages are grouped by their local calendar day', () => {
  const groups = groupMessagesByDay([
    { id: 1, createdAt: new Date(2026, 6, 30, 8).toISOString() },
    { id: 2, createdAt: new Date(2026, 6, 30, 22).toISOString() },
    { id: 3, createdAt: new Date(2026, 6, 31, 9).toISOString() },
  ], now);

  assert.deepEqual(groups.map((group) => group.messages.map((item) => item.id)), [
    [1, 2],
    [3],
  ]);
  assert.deepEqual(groups.map((group) => group.label), ['Вчера', 'Сегодня']);
});

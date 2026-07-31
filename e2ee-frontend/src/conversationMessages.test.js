import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildChatSummaries,
  filterChatSummaries,
  getChatPreview,
  getConversationMessages,
  searchConversationMessages,
} from './features/chat/conversationMessages.js';

const messages = [
  { id: 1, from: 'alice', to: 'bob', text: 'Привет, Боб' },
  { id: 2, from: 'bob', to: 'alice', text: 'Привет, Алиса' },
  { id: 3, from: 'alice', to: 'charlie', text: 'Другой диалог' },
  { id: 4, from: 'charlie', to: 'alice', text: 'Не показывать' },
];

test('active conversation contains messages only for the selected partner', () => {
  const conversation = getConversationMessages(messages, 'alice', 'bob');

  assert.deepEqual(conversation.map((message) => message.id), [1, 2]);
});

test('conversation search is case-insensitive and preserves message order', () => {
  const conversation = getConversationMessages(messages, 'alice', 'bob');
  const results = searchConversationMessages(conversation, 'АЛИСА');

  assert.deepEqual(results.map((message) => message.id), [2]);
  assert.equal(searchConversationMessages(conversation, '  '), conversation);
});

test('chat summaries sort by activity and count only unread incoming messages', () => {
  const summaries = buildChatSummaries(
    ['charlie', 'bob', 'dave'],
    [
      { id: 1, from: 'bob', to: 'alice', text: 'old', status: 'read' },
      { id: 2, from: 'alice', to: 'charlie', text: 'sent', status: 'sent' },
      { id: 3, from: 'bob', to: 'alice', text: 'new', status: 'delivered' },
      { id: 4, from: 'bob', to: 'alice', text: 'newer', status: 'sent' },
    ],
    'alice',
  );

  assert.deepEqual(summaries.map((summary) => summary.partner), [
    'bob',
    'charlie',
    'dave',
  ]);
  assert.equal(summaries[0].lastMessage.id, 4);
  assert.equal(summaries[0].unreadCount, 2);
  assert.equal(summaries[1].unreadCount, 0);
});

test('chat preview identifies outgoing and failed messages truthfully', () => {
  assert.equal(getChatPreview(null, 'alice'), 'Начать диалог');
  assert.equal(getChatPreview(null, 'alice', true), 'История доступна');
  assert.equal(
    getChatPreview({ from: 'bob', text: 'Привет' }, 'alice'),
    'Привет',
  );
  assert.equal(
    getChatPreview({ from: 'alice', text: 'Ответ', status: 'sent' }, 'alice'),
    'Вы: Ответ',
  );
  assert.equal(
    getChatPreview({ from: 'alice', text: 'Ответ', status: 'error' }, 'alice'),
    'Не отправлено: Ответ',
  );
  assert.equal(
    getChatPreview({ from: 'alice', text: '', deleted: true }, 'alice'),
    'Сообщение удалено',
  );
});

test('server unread metadata overrides the loaded history window', () => {
  const [summary] = buildChatSummaries(
    ['bob'],
    [{ id: 1, from: 'bob', to: 'alice', status: 'delivered' }],
    'alice',
    { bob: 12 },
  );

  assert.equal(summary.unreadCount, 12);
});

test('pinned chats sort first and filters keep archive separate', () => {
  const summaries = buildChatSummaries(
    ['bob', 'carol', 'dave'],
    [
      { id: 1, from: 'alice', to: 'bob', text: 'one', status: 'sent' },
      { id: 2, from: 'carol', to: 'alice', text: 'two', status: 'delivered' },
    ],
    'alice',
    { carol: 2 },
    {
      bob: { pinned: true },
      dave: { archived: true },
    },
  );

  assert.deepEqual(summaries.map((summary) => summary.partner), [
    'bob',
    'carol',
    'dave',
  ]);
  assert.deepEqual(
    filterChatSummaries(summaries, 'unread').map((summary) => summary.partner),
    ['carol'],
  );
  assert.deepEqual(
    filterChatSummaries(summaries, 'archive').map((summary) => summary.partner),
    ['dave'],
  );
});

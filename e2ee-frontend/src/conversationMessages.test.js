import assert from 'node:assert/strict';
import test from 'node:test';

import {
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

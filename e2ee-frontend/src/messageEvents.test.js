import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildUnreadMessageCounts,
  createDeleteEnvelope,
  createEditEnvelope,
  createMessageEnvelope,
  createReactionEnvelope,
  hasLoadedAllUnreadEventRows,
  materializeMessageEvents,
  parseMessageEvent,
  serializeMessageEnvelope,
  sortMessageEventsByServerOrder,
} from './features/chat/messageEvents.js';

function transport(overrides = {}) {
  return {
    serverId: 1,
    clientId: 'event-1',
    from: 'alice',
    to: 'bob',
    createdAt: '2026-07-31T12:00:00Z',
    time: '12:00',
    status: 'sent',
    ...overrides,
  };
}

function parse(envelope, overrides = {}) {
  return parseMessageEvent(
    serializeMessageEnvelope(envelope),
    transport(overrides),
  );
}

test('legacy plaintext remains a normal readable message', () => {
  const event = parseMessageEvent('Старое сообщение', transport());

  assert.equal(event.kind, 'message');
  assert.equal(event.messageId, 'event-1');
  assert.equal(event.text, 'Старое сообщение');
  assert.equal(event.legacy, true);
});

test('reply metadata is inside the versioned encrypted envelope', () => {
  const event = parse(
    createMessageEnvelope({
      eventId: 'message-2',
      text: 'Ответ',
      replyTo: 'message-1',
    }),
    { clientId: 'message-2' },
  );

  assert.equal(event.messageId, 'message-2');
  assert.equal(event.replyToId, 'message-1');
  assert.equal(event.text, 'Ответ');
  assert.equal(event.legacy, false);
});

test('authorized edits and deletes materialize without exposing server metadata', () => {
  const base = parse(
    createMessageEnvelope({ eventId: 'message-1', text: 'Первый текст' }),
  );
  const edit = parse(
    createEditEnvelope({
      eventId: 'edit-1',
      targetId: 'message-1',
      text: 'Новый текст',
    }),
    { serverId: 2, clientId: 'edit-1' },
  );
  const unauthorizedDelete = parse(
    createDeleteEnvelope({ eventId: 'delete-bad', targetId: 'message-1' }),
    {
      serverId: 3,
      clientId: 'delete-bad',
      from: 'bob',
      to: 'alice',
    },
  );

  const [message] = materializeMessageEvents(
    [base, edit, unauthorizedDelete],
    'alice',
  );

  assert.equal(message.text, 'Новый текст');
  assert.equal(message.edited, true);
  assert.equal(message.deleted, false);
});

test('reactions are idempotent per participant and can be removed', () => {
  const base = parse(
    createMessageEnvelope({ eventId: 'message-1', text: 'Текст' }),
  );
  const reaction = (eventId, operation) => parse(
    createReactionEnvelope({
      eventId,
      targetId: 'message-1',
      emoji: '🔥',
      operation,
    }),
    {
      serverId: eventId,
      clientId: eventId,
      from: 'bob',
      to: 'alice',
    },
  );

  const [withReaction] = materializeMessageEvents(
    [base, reaction('reaction-1', 'add'), reaction('reaction-2', 'add')],
    'bob',
  );
  const [withoutReaction] = materializeMessageEvents(
    [
      base,
      reaction('reaction-1', 'add'),
      reaction('reaction-2', 'remove'),
    ],
    'bob',
  );

  assert.equal(withReaction.reactions[0].count, 1);
  assert.equal(withReaction.reactions[0].reactedByMe, true);
  assert.deepEqual(withoutReaction.reactions, []);
});

test('reply preview resolves after older target events are loaded', () => {
  const original = parse(
    createMessageEnvelope({ eventId: 'message-1', text: 'Оригинал' }),
  );
  const reply = parse(
    createMessageEnvelope({
      eventId: 'message-2',
      text: 'Ответ',
      replyTo: 'message-1',
    }),
    { serverId: 2, clientId: 'message-2', from: 'bob', to: 'alice' },
  );

  const [unresolved] = materializeMessageEvents([reply], 'alice');
  const [, resolved] = materializeMessageEvents([original, reply], 'alice');

  assert.equal(unresolved.replyTo.available, false);
  assert.equal(resolved.replyTo.text, 'Оригинал');
});

test('unread counts include messages but not encrypted service events', () => {
  const base = parse(
    createMessageEnvelope({ eventId: 'message-1', text: 'Текст' }),
    { from: 'bob', to: 'alice', status: 'delivered' },
  );
  const edit = parse(
    createEditEnvelope({
      eventId: 'edit-1',
      targetId: 'message-1',
      text: 'Новый текст',
    }),
    { serverId: 2, clientId: 'edit-1', from: 'bob', to: 'alice' },
  );
  const reaction = parse(
    createReactionEnvelope({
      eventId: 'reaction-1',
      targetId: 'message-1',
      emoji: '👍',
      operation: 'add',
    }),
    { serverId: 3, clientId: 'reaction-1', from: 'alice', to: 'bob' },
  );

  const messages = materializeMessageEvents([base, edit, reaction], 'alice');

  assert.deepEqual(buildUnreadMessageCounts(messages, 'alice'), { bob: 1 });
});

test('deleted messages do not remain unread', () => {
  const base = parse(
    createMessageEnvelope({ eventId: 'message-1', text: 'Текст' }),
    { from: 'bob', to: 'alice', status: 'delivered' },
  );
  const deletion = parse(
    createDeleteEnvelope({ eventId: 'delete-1', targetId: 'message-1' }),
    { serverId: 2, clientId: 'delete-1', from: 'bob', to: 'alice' },
  );

  const messages = materializeMessageEvents([base, deletion], 'alice');

  assert.deepEqual(buildUnreadMessageCounts(messages, 'alice'), {});
});

test('loaded encrypted rows are compared with opaque server unread totals', () => {
  const rows = [
    { from: 'bob', to: 'alice', status: 'delivered' },
    { from: 'bob', to: 'alice', status: 'sent' },
    { from: 'carol', to: 'alice', status: 'read' },
    { from: 'alice', to: 'bob', status: 'sent' },
  ];

  assert.equal(
    hasLoadedAllUnreadEventRows(rows, 'alice', { bob: 2 }),
    true,
  );
  assert.equal(
    hasLoadedAllUnreadEventRows(rows, 'alice', { bob: 3 }),
    false,
  );
});

test('sparse unread events stay in server order when older history loads', () => {
  const events = [
    { eventId: 'older-1', serverId: 1 },
    { eventId: 'older-11', serverId: 11 },
    { eventId: 'unread-10', serverId: 10 },
    { eventId: 'latest-51', serverId: 51 },
    { eventId: 'optimistic', serverId: null },
  ];

  assert.deepEqual(
    sortMessageEventsByServerOrder(events).map((event) => event.eventId),
    ['older-1', 'unread-10', 'older-11', 'latest-51', 'optimistic'],
  );
});

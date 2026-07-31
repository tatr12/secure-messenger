import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createDeleteEnvelope,
  createEditEnvelope,
  createMessageEnvelope,
  createReactionEnvelope,
  materializeMessageEvents,
  parseMessageEvent,
  serializeMessageEnvelope,
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

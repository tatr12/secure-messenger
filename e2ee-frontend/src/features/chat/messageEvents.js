export const MESSAGE_EVENT_PROTOCOL = 'voiden.message-event';
export const MESSAGE_EVENT_VERSION = 1;
export const MESSAGE_REACTIONS = ['👍', '❤️', '😂', '🔥'];

const EVENT_KINDS = new Set(['message', 'edit', 'delete', 'reaction']);

function createEnvelope(kind, eventId, values = {}) {
  if (!eventId) throw new Error('Message event id is required');
  return {
    protocol: MESSAGE_EVENT_PROTOCOL,
    version: MESSAGE_EVENT_VERSION,
    kind,
    event_id: eventId,
    ...values,
  };
}

export function createMessageEnvelope({ eventId, text, replyTo = null }) {
  return createEnvelope('message', eventId, {
    message_id: eventId,
    text: String(text ?? ''),
    reply_to: replyTo || null,
  });
}

export function createEditEnvelope({ eventId, targetId, text }) {
  if (!targetId) throw new Error('Edited message id is required');
  return createEnvelope('edit', eventId, {
    target_id: targetId,
    text: String(text ?? ''),
  });
}

export function createDeleteEnvelope({ eventId, targetId }) {
  if (!targetId) throw new Error('Deleted message id is required');
  return createEnvelope('delete', eventId, { target_id: targetId });
}

export function createReactionEnvelope({
  eventId,
  targetId,
  emoji,
  operation,
}) {
  if (!targetId) throw new Error('Reaction target id is required');
  if (!MESSAGE_REACTIONS.includes(emoji)) {
    throw new Error('Unsupported message reaction');
  }
  if (!['add', 'remove'].includes(operation)) {
    throw new Error('Unsupported reaction operation');
  }
  return createEnvelope('reaction', eventId, {
    target_id: targetId,
    emoji,
    operation,
  });
}

export function serializeMessageEnvelope(envelope) {
  return JSON.stringify(envelope);
}

function fallbackEventId(transport) {
  if (transport.clientId) return String(transport.clientId);
  if (Number.isInteger(transport.serverId)) {
    return `server:${transport.serverId}`;
  }
  return String(transport.id ?? globalThis.crypto.randomUUID());
}

function parseEnvelope(plaintext) {
  try {
    const value = JSON.parse(plaintext);
    if (
      value?.protocol !== MESSAGE_EVENT_PROTOCOL ||
      value.version !== MESSAGE_EVENT_VERSION ||
      !EVENT_KINDS.has(value.kind)
    ) return null;
    return value;
  } catch {
    return null;
  }
}

export function parseMessageEvent(plaintext, transport = {}) {
  const envelope = parseEnvelope(plaintext);
  const transportEventId = fallbackEventId(transport);
  const common = {
    eventId: envelope?.event_id || transportEventId,
    clientId: transport.clientId ?? null,
    serverId: transport.serverId ?? null,
    from: transport.from,
    to: transport.to,
    createdAt: transport.createdAt ?? null,
    deliveredAt: transport.deliveredAt ?? null,
    readAt: transport.readAt ?? null,
    time: transport.time ?? '',
    status: transport.status ?? 'sent',
  };

  if (!envelope) {
    return {
      ...common,
      kind: 'message',
      messageId: transportEventId,
      text: String(plaintext ?? ''),
      replyToId: null,
      legacy: true,
    };
  }

  if (envelope.kind === 'message') {
    return {
      ...common,
      kind: 'message',
      messageId: envelope.message_id || common.eventId,
      text: String(envelope.text ?? ''),
      replyToId: envelope.reply_to || null,
      legacy: false,
    };
  }

  return {
    ...common,
    kind: envelope.kind,
    targetId: envelope.target_id || null,
    text: envelope.kind === 'edit' ? String(envelope.text ?? '') : null,
    emoji: envelope.kind === 'reaction' ? envelope.emoji : null,
    operation: envelope.kind === 'reaction' ? envelope.operation : null,
    legacy: false,
  };
}

function isSameConversation(event, message) {
  return (
    (event.from === message.from && event.to === message.to) ||
    (event.from === message.to && event.to === message.from)
  );
}

function canModifyMessage(event, message) {
  return (
    isSameConversation(event, message) &&
    event.from === message.from &&
    event.to === message.to
  );
}

function materializeReactionMap(reactionMap, currentUsername) {
  return Array.from(reactionMap.entries())
    .filter(([, users]) => users.size > 0)
    .map(([emoji, users]) => ({
      emoji,
      users: Array.from(users),
      count: users.size,
      reactedByMe: users.has(currentUsername),
    }));
}

export function materializeMessageEvents(events, currentUsername) {
  const messages = new Map();
  const messageOrder = [];

  for (const event of events) {
    if (event.kind === 'message') {
      const existing = messages.get(event.messageId);
      if (existing) {
        Object.assign(existing, {
          clientId: event.clientId,
          serverId: event.serverId,
          createdAt: event.createdAt,
          deliveredAt: event.deliveredAt,
          readAt: event.readAt,
          time: event.time,
          status: event.status,
        });
        continue;
      }

      messageOrder.push(event.messageId);
      messages.set(event.messageId, {
        id: event.messageId,
        messageId: event.messageId,
        eventId: event.eventId,
        clientId: event.clientId,
        serverId: event.serverId,
        from: event.from,
        to: event.to,
        type: 'text',
        text: event.text,
        createdAt: event.createdAt,
        updatedAt: event.createdAt,
        deliveredAt: event.deliveredAt,
        readAt: event.readAt,
        time: event.time,
        status: event.status,
        isMine: event.from === currentUsername,
        edited: false,
        deleted: false,
        replyToId: event.replyToId,
        replyTo: null,
        reactions: [],
        reactionMap: new Map(),
        envelope: event.legacy ? null : 'v1',
      });
      continue;
    }

    if (event.status === 'error' || !event.targetId) continue;
    const target = messages.get(event.targetId);
    if (!target || !isSameConversation(event, target)) continue;

    if (event.kind === 'edit') {
      if (!target.deleted && canModifyMessage(event, target)) {
        target.text = event.text;
        target.edited = true;
        target.updatedAt = event.createdAt ?? target.updatedAt;
      }
      continue;
    }

    if (event.kind === 'delete') {
      if (canModifyMessage(event, target)) {
        target.text = '';
        target.deleted = true;
        target.edited = false;
        target.updatedAt = event.createdAt ?? target.updatedAt;
        target.reactionMap.clear();
      }
      continue;
    }

    if (
      event.kind === 'reaction' &&
      !target.deleted &&
      MESSAGE_REACTIONS.includes(event.emoji) &&
      ['add', 'remove'].includes(event.operation)
    ) {
      const users = target.reactionMap.get(event.emoji) ?? new Set();
      if (event.operation === 'add') users.add(event.from);
      else users.delete(event.from);
      target.reactionMap.set(event.emoji, users);
    }
  }

  return messageOrder.map((messageId) => {
    const message = messages.get(messageId);
    const replyTarget = message.replyToId
      ? messages.get(message.replyToId)
      : null;
    const materialized = {
      ...message,
      reactions: materializeReactionMap(
        message.reactionMap,
        currentUsername,
      ),
      replyTo: message.replyToId
        ? {
            id: message.replyToId,
            from: replyTarget?.from ?? null,
            text: replyTarget?.text ?? '',
            deleted: Boolean(replyTarget?.deleted),
            available: Boolean(replyTarget),
          }
        : null,
    };
    delete materialized.reactionMap;
    return materialized;
  });
}

export function buildUnreadMessageCounts(messages, currentUsername) {
  const counts = {};

  for (const message of messages) {
    if (
      message.to !== currentUsername ||
      message.from === currentUsername ||
      message.status === 'read' ||
      message.deleted
    ) continue;

    counts[message.from] = (counts[message.from] ?? 0) + 1;
  }

  return counts;
}

export function hasLoadedAllUnreadEventRows(
  encryptedRows,
  currentUsername,
  serverUnreadCounts = {},
) {
  const loadedCounts = {};

  for (const row of encryptedRows) {
    if (
      row.to !== currentUsername ||
      row.from === currentUsername ||
      row.status === 'read'
    ) continue;

    loadedCounts[row.from] = (loadedCounts[row.from] ?? 0) + 1;
  }

  return Object.entries(serverUnreadCounts).every(
    ([sender, count]) => (loadedCounts[sender] ?? 0) >= Number(count),
  );
}

export function sortMessageEventsByServerOrder(events) {
  return events
    .map((event, index) => ({ event, index }))
    .sort((first, second) => {
      const firstId = first.event.serverId;
      const secondId = second.event.serverId;
      const firstPersisted = Number.isInteger(firstId);
      const secondPersisted = Number.isInteger(secondId);

      if (firstPersisted && secondPersisted) return firstId - secondId;
      if (firstPersisted !== secondPersisted) return firstPersisted ? -1 : 1;
      return first.index - second.index;
    })
    .map(({ event }) => event);
}

export function getMessageEventNotification(event) {
  if (event.kind === 'edit') return 'Сообщение изменено';
  if (event.kind === 'delete') return 'Сообщение удалено';
  if (event.kind === 'reaction') return `${event.emoji} Реакция на сообщение`;
  return event.text;
}

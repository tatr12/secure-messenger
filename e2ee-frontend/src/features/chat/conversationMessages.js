export function getConversationMessages(messages, currentUsername, partnerUsername) {
  if (!currentUsername || !partnerUsername) return [];

  return messages.filter((message) => {
    const isOutgoing =
      message.from === currentUsername && message.to === partnerUsername;
    const isIncoming =
      message.from === partnerUsername && message.to === currentUsername;
    return isOutgoing || isIncoming;
  });
}

export function searchConversationMessages(messages, query) {
  const normalizedQuery = query.trim().toLocaleLowerCase('ru-RU');
  if (!normalizedQuery) return messages;

  return messages.filter((message) => {
    const text = message.text ?? message.content ?? '';
    return text.toLocaleLowerCase('ru-RU').includes(normalizedQuery);
  });
}

function getPartnerUsername(message, currentUsername) {
  if (message.from === currentUsername) return message.to;
  if (message.to === currentUsername) return message.from;
  return null;
}

export function buildChatSummaries(
  chatPartners,
  messages,
  currentUsername,
  unreadCounts = {},
) {
  const partnerOrder = new Map(
    chatPartners.map((partner, index) => [partner, index]),
  );
  const summaries = new Map(
    chatPartners.map((partner) => [
      partner,
      {
        partner,
        lastMessage: null,
        lastMessageIndex: -1,
        unreadCount: 0,
      },
    ]),
  );

  messages.forEach((message, index) => {
    const partner = getPartnerUsername(message, currentUsername);
    if (!partner) return;

    const summary = summaries.get(partner) ?? {
      partner,
      lastMessage: null,
      lastMessageIndex: -1,
      unreadCount: 0,
    };

    summary.lastMessage = message;
    summary.lastMessageIndex = index;
    if (message.from === partner && message.status !== 'read') {
      summary.unreadCount += 1;
    }
    summaries.set(partner, summary);
  });

  for (const summary of summaries.values()) {
    if (summary.partner in unreadCounts) {
      summary.unreadCount = unreadCounts[summary.partner];
    }
  }

  return Array.from(summaries.values()).sort((first, second) => {
    if (first.lastMessageIndex !== second.lastMessageIndex) {
      return second.lastMessageIndex - first.lastMessageIndex;
    }
    return (
      (partnerOrder.get(first.partner) ?? Number.MAX_SAFE_INTEGER) -
      (partnerOrder.get(second.partner) ?? Number.MAX_SAFE_INTEGER)
    );
  });
}

export function getChatPreview(message, currentUsername, hasHistory = false) {
  if (!message) return hasHistory ? 'История доступна' : 'Начать диалог';

  const text = String(message.text ?? message.content ?? '').trim();
  const preview = text || 'Зашифрованное сообщение';
  if (message.from !== currentUsername) return preview;
  if (message.status === 'error') return `Не отправлено: ${preview}`;
  return `Вы: ${preview}`;
}

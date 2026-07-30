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

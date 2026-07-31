export function buildWebSocketUrl(pageLocation = globalThis.location) {
  if (!pageLocation?.protocol || !pageLocation?.host) {
    throw new Error('Не удалось определить адрес WebSocket');
  }

  const protocol = pageLocation.protocol === 'https:' ? 'wss:' : 'ws:';
  return new URL('/ws', `${protocol}//${pageLocation.host}`).toString();
}

export function buildWebSocketProtocols(token) {
  if (!token) throw new Error('Отсутствует токен сессии');
  return ['voiden', `voiden.auth.${token}`];
}

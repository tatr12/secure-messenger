const STATUS_PRIORITY = {
  sending: 0,
  sent: 1,
  delivered: 2,
  read: 3,
};

export function advanceMessageStatus(currentStatus, nextStatus) {
  if (currentStatus === 'error') {
    return nextStatus === 'sending' ? 'sending' : 'error';
  }
  if (!(nextStatus in STATUS_PRIORITY)) return currentStatus;
  if (!(currentStatus in STATUS_PRIORITY)) return nextStatus;
  return STATUS_PRIORITY[nextStatus] > STATUS_PRIORITY[currentStatus]
    ? nextStatus
    : currentStatus;
}

export function getMessageStatusLabel(status) {
  const labels = {
    sending: 'Отправляется',
    sent: 'Сохранено сервером',
    delivered: 'Доставлено',
    read: 'Прочитано',
    error: 'Не отправлено',
  };
  return labels[status] ?? 'Статус неизвестен';
}

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  advanceMessageStatus,
  getMessageStatusLabel,
} from './features/chat/messageStatus.js';

test('message delivery status only moves forward', () => {
  assert.equal(advanceMessageStatus('sending', 'sent'), 'sent');
  assert.equal(advanceMessageStatus('sent', 'delivered'), 'delivered');
  assert.equal(advanceMessageStatus('delivered', 'read'), 'read');
  assert.equal(advanceMessageStatus('read', 'delivered'), 'read');
});

test('an explicit retry can replace error with sending', () => {
  assert.equal(advanceMessageStatus('error', 'sending'), 'sending');
  assert.equal(advanceMessageStatus('error', 'read'), 'error');
  assert.equal(getMessageStatusLabel('error'), 'Не отправлено');
});

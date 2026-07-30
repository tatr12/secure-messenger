import assert from 'node:assert/strict';
import test from 'node:test';

import { createSessionLifecycle } from './sessionLifecycle.js';

function createFakeTimers() {
  let nextTimerId = 1;
  const callbacks = new Map();

  return {
    callbacks,
    setTimer(callback) {
      const timerId = nextTimerId;
      nextTimerId += 1;
      callbacks.set(timerId, callback);
      return timerId;
    },
    clearTimer(timerId) {
      callbacks.delete(timerId);
    },
  };
}

test('ending a session cancels its pending reconnect', () => {
  const timers = createFakeTimers();
  const lifecycle = createSessionLifecycle(timers);
  const generation = lifecycle.begin();
  let reconnectCount = 0;

  lifecycle.scheduleReconnect(generation, () => {
    reconnectCount += 1;
  }, 4000);

  assert.equal(timers.callbacks.size, 1);
  lifecycle.end();
  assert.equal(timers.callbacks.size, 0);
  assert.equal(reconnectCount, 0);
});

test('a stale timer cannot reconnect after a new session starts', () => {
  const timers = createFakeTimers();
  const lifecycle = createSessionLifecycle(timers);
  const firstGeneration = lifecycle.begin();
  let reconnectCount = 0;

  lifecycle.scheduleReconnect(firstGeneration, () => {
    reconnectCount += 1;
  }, 4000);

  const staleCallback = [...timers.callbacks.values()][0];
  lifecycle.end();
  const secondGeneration = lifecycle.begin();

  staleCallback();

  assert.equal(lifecycle.isActive(firstGeneration), false);
  assert.equal(lifecycle.isActive(secondGeneration), true);
  assert.equal(reconnectCount, 0);
});

test('ending a session cancels its pending token refresh', () => {
  const timers = createFakeTimers();
  const lifecycle = createSessionLifecycle(timers);
  const generation = lifecycle.begin();
  let refreshCount = 0;

  lifecycle.scheduleRefresh(generation, () => {
    refreshCount += 1;
  }, 840_000);

  assert.equal(timers.callbacks.size, 1);
  lifecycle.end();
  assert.equal(timers.callbacks.size, 0);
  assert.equal(refreshCount, 0);
});

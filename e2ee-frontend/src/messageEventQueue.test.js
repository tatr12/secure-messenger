import assert from 'node:assert/strict';
import test from 'node:test';

import { createMessageEventQueue } from './features/chat/messageEventQueue.js';

function deferred() {
  let resolve;
  const promise = new Promise((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

test('message event tasks execute in enqueue order', async () => {
  const queue = createMessageEventQueue();
  const firstGate = deferred();
  const order = [];

  const first = queue.enqueue(async () => {
    order.push('first:start');
    await firstGate.promise;
    order.push('first:end');
  });
  const second = queue.enqueue(() => {
    order.push('second');
  });

  await Promise.resolve();
  assert.deepEqual(order, ['first:start']);

  firstGate.resolve();
  await Promise.all([first, second]);

  assert.deepEqual(order, ['first:start', 'first:end', 'second']);
});

test('a failed task does not block later message events', async () => {
  const queue = createMessageEventQueue();
  const order = [];

  const failed = queue.enqueue(() => {
    order.push('failed');
    throw new Error('network failure');
  });
  const recovered = queue.enqueue(() => {
    order.push('recovered');
  });

  await assert.rejects(failed, /network failure/);
  await recovered;

  assert.deepEqual(order, ['failed', 'recovered']);
});

test('reset lets a new session start without waiting for an old task', async () => {
  const queue = createMessageEventQueue();
  const oldGate = deferred();
  const order = [];

  const oldTask = queue.enqueue(async () => {
    order.push('old:start');
    await oldGate.promise;
    order.push('old:end');
  });
  await Promise.resolve();

  queue.reset();
  await queue.enqueue(() => {
    order.push('new');
  });

  assert.deepEqual(order, ['old:start', 'new']);
  oldGate.resolve();
  await oldTask;
});

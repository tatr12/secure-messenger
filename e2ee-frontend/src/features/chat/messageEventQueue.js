export function createMessageEventQueue() {
  let tail = Promise.resolve();

  return {
    enqueue(task) {
      const result = tail.then(task, task);
      tail = result.then(
        () => undefined,
        () => undefined,
      );
      return result;
    },
    reset() {
      tail = Promise.resolve();
    },
  };
}

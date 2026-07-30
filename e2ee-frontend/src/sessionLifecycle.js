export function createSessionLifecycle({
  setTimer = globalThis.setTimeout,
  clearTimer = globalThis.clearTimeout,
} = {}) {
  let generation = 0;
  let reconnectAllowed = false;
  let reconnectTimer = null;

  const cancelReconnect = () => {
    if (reconnectTimer === null) return;

    clearTimer(reconnectTimer);
    reconnectTimer = null;
  };

  const isActive = (candidateGeneration) =>
    reconnectAllowed && candidateGeneration === generation;

  return {
    begin() {
      cancelReconnect();
      generation += 1;
      reconnectAllowed = true;
      return generation;
    },

    end() {
      reconnectAllowed = false;
      generation += 1;
      cancelReconnect();
      return generation;
    },

    currentGeneration() {
      return generation;
    },

    isActive,

    scheduleReconnect(candidateGeneration, callback, delayMs) {
      if (!isActive(candidateGeneration)) return false;

      cancelReconnect();
      reconnectTimer = setTimer(() => {
        reconnectTimer = null;

        if (isActive(candidateGeneration)) {
          callback(candidateGeneration);
        }
      }, delayMs);

      return true;
    },

    cancelReconnect,
  };
}

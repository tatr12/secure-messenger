export function createSessionLifecycle({
  setTimer = globalThis.setTimeout,
  clearTimer = globalThis.clearTimeout,
} = {}) {
  let generation = 0;
  let reconnectAllowed = false;
  let reconnectTimer = null;
  let refreshTimer = null;

  const cancelReconnect = () => {
    if (reconnectTimer === null) return;

    clearTimer(reconnectTimer);
    reconnectTimer = null;
  };

  const isActive = (candidateGeneration) =>
    reconnectAllowed && candidateGeneration === generation;

  const cancelRefresh = () => {
    if (refreshTimer === null) return;

    clearTimer(refreshTimer);
    refreshTimer = null;
  };

  return {
    begin() {
      cancelReconnect();
      cancelRefresh();
      generation += 1;
      reconnectAllowed = true;
      return generation;
    },

    end() {
      reconnectAllowed = false;
      generation += 1;
      cancelReconnect();
      cancelRefresh();
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

    scheduleRefresh(candidateGeneration, callback, delayMs) {
      if (!isActive(candidateGeneration)) return false;

      cancelRefresh();
      refreshTimer = setTimer(() => {
        refreshTimer = null;

        if (isActive(candidateGeneration)) {
          callback(candidateGeneration);
        }
      }, delayMs);

      return true;
    },

    cancelReconnect,
    cancelRefresh,
  };
}

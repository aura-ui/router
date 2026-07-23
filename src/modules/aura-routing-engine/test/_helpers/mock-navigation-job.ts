/** Minimal cancellable transaction slice for tests. */
export function createMockNavigationJob(id = 1) {
  const controller = new AbortController();
  return {
    transactionId: id,
    transactionSignal: controller.signal,
    abort: () => controller.abort(),
  };
}

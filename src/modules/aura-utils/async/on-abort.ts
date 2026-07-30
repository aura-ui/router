export function onAbort(signal: AbortSignal, callback: () => void): () => void {
  if (signal.aborted) {
    callback();
    return () => undefined;
  }

  const handler = () => callback();
  signal.addEventListener('abort', handler, { once: true });
  return () => signal.removeEventListener('abort', handler);
}

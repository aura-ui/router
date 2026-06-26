/** Per-href delayed intent scheduling (hover debounce). */
export class PrefetchIntentScheduler {
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();

  schedule(key: string, delayMs: number, run: () => void): void {
    this.cancel(key);

    if (delayMs <= 0) {
      run();
      return;
    }

    const timer = setTimeout(() => {
      this.timers.delete(key);
      run();
    }, delayMs);

    this.timers.set(key, timer);
  }

  cancel(key?: string): void {
    if (key === undefined) {
      for (const timer of this.timers.values()) clearTimeout(timer);
      this.timers.clear();
      return;
    }

    const timer = this.timers.get(key);
    if (timer) clearTimeout(timer);
    this.timers.delete(key);
  }

  has(key: string): boolean {
    return this.timers.has(key);
  }

  destroy(): void {
    this.cancel();
  }
}

/** Resolve after `ms` (jsdom / fake-timer friendly via real `setTimeout`). */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type WaitForTextOptions = {
  timeout?: number;
  interval?: number;
};

/** Poll until `root.textContent` includes `text`, or throw on timeout. */
export async function waitForText(
  root: ParentNode,
  text: string,
  options: WaitForTextOptions = {},
): Promise<void> {
  const timeout = options.timeout ?? 3000;
  const interval = options.interval ?? 10;
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (root.textContent?.includes(text)) return;
    await sleep(interval);
  }
  throw new Error(`Timed out waiting for "${text}"`);
}

/**
 * Minimal browser globals for Node benchmarks (splitAppHref, PrefetchPolicy).
 */
export function setupMinimalWindow(origin = 'http://localhost'): void {
  const g = globalThis as typeof globalThis & {
    window?: { location: { origin: string; href: string } };
  };
  if (g.window?.location?.origin) return;
  g.window = {
    location: {
      origin,
      href: `${origin}/`,
    },
  };
}

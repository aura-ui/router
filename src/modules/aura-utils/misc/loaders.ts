import { registerComponent, type Registerable } from './component';

/** Relative to `aura-utils/misc` → `src/`. */
const pathPrefix = '../../../';

const ABORT_ERROR = new DOMException('Aborted', 'AbortError');

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw ABORT_ERROR;
}

function findRegisterableExport(exports: Record<string, unknown>): Registerable | null {
  for (const value of Object.values(exports)) {
    if (value && typeof value === 'function' && typeof (value as Registerable).is === 'string') {
      return value as Registerable;
    }
  }
  return null;
}

/** Races dynamic import against navigation abort; import itself is not cancellable. */
async function importModule(path: string, signal?: AbortSignal): Promise<Record<string, unknown>> {
  const load = import(pathPrefix + path) as Promise<Record<string, unknown>>;
  if (!signal) return load;

  throwIfAborted(signal);

  let onAbort: (() => void) | undefined;
  const aborted = new Promise<never>((_, reject) => {
    onAbort = () => reject(ABORT_ERROR);
    signal.addEventListener('abort', onAbort, { once: true });
  });

  try {
    return await Promise.race([load, aborted]);
  } finally {
    if (onAbort) signal.removeEventListener('abort', onAbort);
  }
}

export async function loadAndRegisterComponent(
  path: string,
  signal?: AbortSignal,
): Promise<string> {
  throwIfAborted(signal);

  const exports = await importModule(path, signal);
  throwIfAborted(signal);

  const Component = findRegisterableExport(exports);
  if (!Component) {
    throw new Error(`Not found [is] property inside the component: ${path}`);
  }

  registerComponent(Component);
  return Component.is;
}
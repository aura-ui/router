import { registerComponent, type Registerable } from './component';

/** Relative to `aura-utils/misc` → `src/`. */
const pathPrefix = '../../../';

function findRegisterableExport(exports: Record<string, unknown>): Registerable | null {
  for (const value of Object.values(exports)) {
    if (value && typeof value === 'function' && typeof (value as Registerable).is === 'string') {
      return value as Registerable;
    }
  }
  return null;
}

/** Dynamic import + first export with static `is` → `customElements.define`. Not abortable. */
export async function loadAndRegisterComponent(path: string): Promise<string> {
  const exports = (await import(pathPrefix + path)) as Record<string, unknown>;

  const Component = findRegisterableExport(exports);
  if (!Component) {
    throw new Error(`Not found [is] property inside the component: ${path}`);
  }

  registerComponent(Component);
  return Component.is;
}

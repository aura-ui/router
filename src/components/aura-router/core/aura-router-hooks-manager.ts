import type { RouteHookDefinition, RouteLifecycleContext } from '../plugins/types';
import { ROUTER_VERSION, satisfiesRouterVersion } from '../version';

interface RegisteredHook {
  definition: RouteHookDefinition;
  options: Record<string, unknown>;
}

export class RouteHookRegistry {
  private static registry = new Map<string, RegisteredHook>();

  static register(hook: RouteHookDefinition, options: Record<string, unknown> = {}): void {
    const existing = this.registry.get(hook.name);

    if (existing && existing.definition.version !== hook.version) {
      console.warn(`Hook "${hook.name}" ${existing.definition.version} → ${hook.version}`);
    }

    if (hook.requires && !satisfiesRouterVersion(ROUTER_VERSION, hook.requires)) {
      console.warn(`Hook "${hook.name}@${hook.version}" requires router ${hook.requires}`);
    }

    this.registry.set(hook.name, { definition: hook, options });
  }

  static get(name: string): RegisteredHook | undefined {
    return this.registry.get(name);
  }

  static async run(
    names: string[],
    ctx: RouteLifecycleContext,
  ): Promise<boolean | void | string> {
    for (const name of names) {
      const entry = this.registry.get(name);

      if (!entry) {
        console.warn(`Unknown hook "${name}" on route ${ctx.route.path} (phase ${ctx.phase})`);
        continue;
      }

      const result = await entry.definition.fn({
        ...ctx,
        options: entry.options,
      });

      if (result === false || typeof result === 'string') {
        return result;
      }
    }
  }
}

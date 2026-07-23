import {
  closestRouteWithLoadHooks,
  resolveRouteData,
} from '../../core/data-graph/route-data';
import { createMatchedRoute } from '../_helpers/create-mock-transaction';

function matched(path: string, load: string[] | null = ['data']) {
  return createMatchedRoute(path, { load });
}

describe('route-data helpers', () => {
  it('resolveRouteData reads snapshot by dataKey when route has load hooks', () => {
    const route = matched('/users');
    const snapshot = new Map<string, unknown>([[route.dataKey!, { id: 1 }]]);

    expect(resolveRouteData(snapshot, route)).toEqual({ id: 1 });
    expect(resolveRouteData(new Map(), route)).toBeUndefined();
  });

  it('resolveRouteData returns undefined without load hooks or dataKey', () => {
    const noHooks = matched('/static', null);
    const snapshot = new Map<string, unknown>([['data:/static', { x: 1 }]]);
    expect(resolveRouteData(snapshot, noHooks)).toBeUndefined();

    const missingKey = matched('/keyed');
    delete missingKey.dataKey;
    expect(resolveRouteData(new Map([['data:/keyed', 1]]), missingKey)).toBeUndefined();
  });

  it('closestRouteWithLoadHooks walks ancestors root→leaf', () => {
    const layout = matched('/app', null);
    const parent = matched('/app/settings', ['parent-data']);
    const leaf = matched('/app/settings/users', ['leaf-data']);
    const branch = [layout, parent, leaf];

    expect(closestRouteWithLoadHooks(leaf, branch)).toBe(parent);
    expect(closestRouteWithLoadHooks(parent, branch)).toBeUndefined();
    expect(closestRouteWithLoadHooks(leaf, [leaf])).toBeUndefined();
  });

  it('closestRouteWithLoadHooks returns undefined when no ancestor has load', () => {
    const shell = matched('/app', null);
    const leaf = matched('/app/home', ['leaf-data']);

    expect(closestRouteWithLoadHooks(leaf, [shell, leaf])).toBeUndefined();
  });
});

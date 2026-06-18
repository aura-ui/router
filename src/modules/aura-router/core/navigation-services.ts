import type { RouterInstance } from '../../aura-route-hooks/core';
import type { NavigationJobManager } from './navigation-job';

/** Shared navigation callbacks for phase execution. */
export interface NavigationServices {
  jobManager: NavigationJobManager;
  router: RouterInstance;
}

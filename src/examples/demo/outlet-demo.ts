import { getDemoScenario } from './demo-scenarios';
import { installDemoFooter } from './demo-footer';
import { installDemoLayoutTemplates } from './layout-templates';

/** Подсветка корневого и вложенных outlet (вызывать после каждой навигации). */
export function highlightDemoOutlets(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>('.demo-site-outlet').forEach((outlet) => {
    outlet.classList.add('demo-root-outlet');
  });

  root.querySelectorAll<HTMLElement>('.demo-layout-slot > aura-outlet').forEach((outlet) => {
    outlet.classList.add('demo-nested-outlet');
  });
}

/**
 * Инициализация demo-shell: layout-шаблоны (если задан сценарий) + подсветка outlet.
 * Вызывать до AuraRouter.install().
 */
export function installDemoShell(root: ParentNode = document): void {
  const site = root.querySelector<HTMLElement>('.demo-site[data-demo-scenario]');
  const scenarioId = site?.dataset.demoScenario;
  const scenario = getDemoScenario(scenarioId);

  if (scenario?.layout) {
    installDemoLayoutTemplates(scenario.root, scenario.layout);
  }

  installDemoFooter(scenarioId);
  highlightDemoOutlets(root);
}

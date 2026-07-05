import { getDemoScenario } from './demo-scenarios';

function renderNextStepLinks(links: { href: string; label: string }[]): string {
  return links
    .map((link) => `<a href="${link.href}">${link.label}</a>`)
    .join(' и ');
}

/** Единый footer «Далее» для demo-shell. */
export function installDemoFooter(scenarioId: string | undefined): void {
  const site = document.querySelector('.demo-site');
  const scenario = getDemoScenario(scenarioId);
  if (!site || !scenario?.nextStep?.length) return;

  let footer = site.querySelector('.demo-site-footer');
  if (!footer) {
    footer = document.createElement('footer');
    footer.className = 'demo-site-footer';
    site.appendChild(footer);
  }

  footer.innerHTML = `<p class="demo-site-footer__text">Далее — ${renderNextStepLinks(scenario.nextStep)}.</p>`;
}

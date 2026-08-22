import type { DemoLayoutConfig, DemoNavLink } from './demo-scenarios';

function renderNavLinks(basePath: string, links: DemoNavLink[]): string {
  return links
    .map(
      (link) =>
        `<a href="${basePath}${link.path}" data-aura-link>${link.label}</a>`,
    )
    .join('\n        ');
}

function renderLayoutSlot(label: string): string {
  return `
      <div class="demo-layout-slot">
        <span class="demo-layout-slot__label">${label}</span>
        <aura-outlet></aura-outlet>
      </div>`;
}

function renderUsersLayout(basePath: string, config: DemoLayoutConfig): string {
  const usersBadge = config.userNav ? 'Layout L1: users-layout' : 'Layout: users-layout';

  return `
    <div data-nested-layout>
      <span class="demo-layout-badge">${usersBadge}</span>
      <div class="demo-layout-chrome">
        <p class="demo-nested-label">${config.usersChromeLabel}</p>
        <nav class="demo-links">
        ${renderNavLinks(basePath, config.usersNav)}
        </nav>
      </div>${renderLayoutSlot(config.slotLabelL1)}
    </div>`;
}

function renderUserLayout(basePath: string, config: DemoLayoutConfig): string {
  if (!config.userNav || !config.userChromeLabel || !config.slotLabelL2) {
    throw new Error('user-layout requires userNav, userChromeLabel and slotLabelL2');
  }

  return `
    <div data-user-layout>
      <span class="demo-layout-badge">Layout L2: user-layout</span>
      <div class="demo-layout-chrome">
        <p class="demo-nested-label">${config.userChromeLabel}</p>
        <nav class="demo-links">
        ${renderNavLinks(basePath, config.userNav)}
        </nav>
      </div>${renderLayoutSlot(config.slotLabelL2)}
    </div>`;
}

function injectTemplate(id: string, html: string): void {
  if (document.getElementById(id)) return;

  const tpl = document.createElement('template');
  tpl.id = id;
  tpl.innerHTML = html.trim();
  document.body.appendChild(tpl);
}

/** Регистрирует &lt;template id="users-layout"&gt; (и опционально user-layout) до старта роутера. */
export function installDemoLayoutTemplates(basePath: string, config: DemoLayoutConfig): void {
  injectTemplate('users-layout', renderUsersLayout(basePath, config));

  if (config.userNav) {
    injectTemplate('user-layout', renderUserLayout(basePath, config));
  }
}

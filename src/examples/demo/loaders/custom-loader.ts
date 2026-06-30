import type { LoaderFn } from '../../../modules/aura-routing-engine/core';

export const customLoader: LoaderFn = async (ctx) => {
  const pattern = ctx.route.pattern;
  const href = ctx.route.href;

  return `<article class="scene">
    <p class="scene__eyebrow">Свой loader</p>
    <h2 class="scene__title">Зарегистрированный LoaderFn</h2>
    <p class="scene__text">Тип <code>custom-loader</code> подключён в <code>main.ts</code> через <code>AuraRouter.registerLoader</code>. Так можно грузить CMS, GraphQL, markdown и т.д.</p>
    <dl class="scene__facts">
      <div><dt>Pattern</dt><dd><code>${pattern}</code></dd></div>
      <div><dt>Href</dt><dd><code>${href}</code></dd></div>
    </dl>
  </article>`;
};

export const CUSTOM_LOADER_TYPE = 'custom-loader' as const;

import type { LoaderFn } from '../../../modules/aura-routing-engine/core';

const DELAY_MS = 1400;

export const slowLoader: LoaderFn = async () => {
  await new Promise((resolve) => setTimeout(resolve, DELAY_MS));

  return `<article class="scene">
    <p class="scene__eyebrow">Медленная загрузка</p>
    <h2 class="scene__title">Контент готов</h2>
    <p class="scene__text">Loader ждал <strong>${DELAY_MS} ms</strong>. Пока идёт загрузка, роутер показывает <code>loading-template</code> — спиннер в области просмотра.</p>
    <div class="scene__callout scene__callout--ok">Попробуйте перейти сюда ещё раз — второй раз будет мгновенно (кеш).</div>
  </article>`;
};

export const SLOW_LOADER_TYPE = 'slow-loader' as const;

import { AuraRouter, defineRouteHook } from '@auraui/router';

const JOURNEY_KEY = 'diskora-traveler';

const REGION_NAMES = {
  whisperwood: 'Шепчущий Лес',
  mirrorsea: 'Зеркальное Море',
  icewall: 'Ледяная Стена',
  hearthlands: 'Срединные Земли',
  sunsteppe: 'Солнечная Степь',
};

const journeyGuard = defineRouteHook('journey', async () => {
  if (sessionStorage.getItem(JOURNEY_KEY)) return;
  return { type: 'redirect', url: '/start-journey', replace: true };
});

function syncRegionChrome(regionId) {
  if (!regionId) return;

  const name = REGION_NAMES[regionId] || regionId;
  const title = document.querySelector('.region-name');
  if (title && title.textContent !== name) {
    title.textContent = name;
  }

  const overview = document.querySelector('[data-nav="overview"]');
  const journal = document.querySelector('[data-nav="journal"]');
  const overviewHref = `/regions/${regionId}`;
  const journalHref = `/regions/${regionId}/journal`;

  if (overview) {
    if (overview.getAttribute('href') !== overviewHref) {
      overview.setAttribute('href', overviewHref);
    }
    if (!overview.hasAttribute('aura-router-link')) {
      overview.setAttribute('aura-router-link', '');
    }
  }

  if (journal) {
    if (journal.getAttribute('href') !== journalHref) {
      journal.setAttribute('href', journalHref);
    }
    if (!journal.hasAttribute('aura-router-link')) {
      journal.setAttribute('aura-router-link', '');
    }
  }
}

const regionChrome = defineRouteHook('region-chrome', async (ctx) => {
  syncRegionChrome(ctx.to.params?.regionId);
});

AuraRouter.use(journeyGuard);
AuraRouter.use(regionChrome);
AuraRouter.install();

function router() {
  return document.querySelector('aura-router');
}

document.addEventListener('submit', (event) => {
  const form = event.target.closest('[data-journey-form]');
  if (!form) return;
  event.preventDefault();
  const name = String(new FormData(form).get('name') || '').trim();
  if (!name) return;
  sessionStorage.setItem(JOURNEY_KEY, name);
  router()?.navigate('/wall/beyond');
});

document.addEventListener('click', (event) => {
  const reset = event.target.closest('[data-journey-reset]');
  if (!reset) return;
  sessionStorage.removeItem(JOURNEY_KEY);
  router()?.navigate('/');
});

import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'pages');

function page(rel, title, body) {
  const file = join(root, rel);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(
    file,
    `<!DOCTYPE html>
<html lang="ru">
<head><meta charset="utf-8" /><title>${title}</title></head>
<body>
<div class="main">
<article class="scroll-mark">
${body}
</article>
</div>
</body>
</html>
`,
  );
}

page(
  'about.html',
  'О проекте',
  `
  <h1>Орбитальный атлас</h1>
  <p class="lede">Образовательный демо-сайт для <strong>@auraui/router</strong>: маршруты рассказывают про космос, а попутно показывают nested layouts, extract, cache, loading и guard.</p>
  <ul class="lede" style="padding-left:1.2em">
    <li><strong>Хроника</strong> — время советской космонавтики.</li>
    <li><strong>Система</strong> — планеты и экспедиции.</li>
    <li><strong>Мир</strong> — прогулка по отсекам станции.</li>
    <li><strong>Глубина</strong> — масштабы от системы до горизонта.</li>
  </ul>
  <div class="actions">
    <a class="btn" href="/chronicle/flight" aura-router-link>Начать экспедицию</a>
    <a class="btn ghost" href="/" aura-router-link>В ЦУП</a>
  </div>
`,
);

page(
  'briefing.html',
  'Брифинг',
  `
  <div class="callout" data-guard-banner hidden>
    <strong>Сначала позывной.</strong> Путь за горизонт закрыт. Вас вернули на брифинг.
  </div>
  <h1>Брифинг исследователя</h1>
  <p class="lede">Впишите позывной — и дальняя зона атласа узнает вас. Без записи guard вернёт сюда.</p>
  <form class="brief-form" data-briefing-form>
    <label>Позывной
      <input name="callsign" type="text" placeholder="например, Восток" required maxlength="32" />
    </label>
    <button class="btn" type="submit">Открыть горизонт</button>
  </form>
  <p class="hint" style="margin-top:16px">Хранится только в sessionStorage этой вкладки.</p>
  <div class="actions">
    <a class="btn ghost" href="/deep/observable" aura-router-link>К наблюдаемой Вселенной</a>
  </div>
`,
);

page(
  'fleet.html',
  'Флот',
  `
  <h1>Флот атласа</h1>
  <p class="lede">Корабли и аппараты, которые связывают хронику, планеты и станцию. Плоская ветка с cache на списке.</p>
  <div class="card-grid">
    <a class="card is-primary-path" href="/fleet/vostok" aura-router-link>
      <span class="tag">Пилотируемый</span>
      <h3>Восток</h3>
      <p>Первый орбитальный корабль.</p>
    </a>
    <a class="card" href="/fleet/soyuz" aura-router-link>
      <span class="tag">Рабочая лошадка</span>
      <h3>Союз</h3>
      <p>Экипажи к станциям десятилетиями.</p>
    </a>
    <a class="card" href="/fleet/lunokhod" aura-router-link>
      <span class="tag">Луна</span>
      <h3>Луноход</h3>
      <p>Колёса на другом мире.</p>
    </a>
    <a class="card" href="/fleet/buran" aura-router-link>
      <span class="tag">Многоразовый</span>
      <h3>Буран</h3>
      <p>Один орбитальный полёт — и легенда.</p>
    </a>
  </div>
  <div class="actions">
    <a class="btn ghost" href="/" aura-router-link>В ЦУП</a>
  </div>
`,
);

const fleet = [
  [
    'vostok',
    'Восток',
    'Одноместный корабль первого поколения. 12 апреля 1961 года вывел Юрия Гагарина на орбиту.',
    '/chronicle/flight/gagarin',
    'К событию Гагарина',
    '/system/earth/missions/vostok-1',
    'Миссия Восток-1',
  ],
  [
    'soyuz',
    'Союз',
    'Семейство кораблей для доставки экипажей и грузов. Стал мостом к «Салютам» и «Миру».',
    '/chronicle/orbit',
    'К эпохе орбиты',
    '/mir',
    'На станцию «Мир»',
  ],
  [
    'lunokhod',
    'Луноход',
    'Планетоходы «Луноход-1» и «Луноход-2» исследовали поверхность Луны по радиоканалу с Земли.',
    '/system/moon',
    'К Луне',
    '/fleet',
    'Весь флот',
  ],
  [
    'buran',
    'Буран',
    'Орбитальный корабль системы «Энергия — Буран». Единственный полёт — 15 ноября 1988 года, без экипажа.',
    '/chronicle/orbit',
    'К эпохе орбиты',
    '/fleet',
    'Весь флот',
  ],
];

for (const [id, name, text, a, al, b, bl] of fleet) {
  page(
    `fleet/${id}.html`,
    name,
    `
    <span class="tag">Флот</span>
    <h1>${name}</h1>
    <p class="lede">${text}</p>
    <div class="actions">
      <a class="btn" href="${a}" aura-router-link>${al}</a>
      <a class="btn ghost" href="${b}" aura-router-link>${bl}</a>
    </div>
  `,
  );
}

const eras = {
  dreams: {
    title: 'Мечта',
    lede: 'До первых стартов — формулы, чертежи и убеждение, что Земля — колыбель, но не навсегда.',
    items: [['1903+', 'Циолковский', 'tsiolkovsky', 'Ракета как путь к звёздам']],
  },
  dawn: {
    title: 'Рассвет',
    lede: 'От КБ Королёва до первого искусственного спутника — космос становится инженерией.',
    items: [['1957', 'Спутник-1', 'sputnik', 'Первый искусственный спутник Земли']],
  },
  flight: {
    title: 'Полёт',
    lede: 'Человек выходит на орбиту. Дни, которые меняют ощущение планеты.',
    items: [
      ['1961', 'Гагарин', 'gagarin', 'Первый человек в космосе', true],
      ['1963', 'Терешкова', 'tereshkova', 'Первая женщина на орбите'],
      ['1965', 'Леонов', 'leonov', 'Первый выход в открытый космос'],
    ],
  },
  orbit: {
    title: 'Орбита',
    lede: 'Долгие экспедиции: от «Салютов» к комплексу «Мир» — дом над Землёй.',
    items: [
      ['1971+', 'Салют', 'salyut', 'Первые орбитальные станции'],
      ['1986', 'Станция «Мир»', 'mir', 'Модульный орбитальный город'],
    ],
  },
};

for (const [id, era] of Object.entries(eras)) {
  const list = era.items
    .map(
      ([when, name, slug, hint, primary]) => `
    <li>
      <a class="${primary ? 'is-primary-path' : ''}" href="/chronicle/${id}/${slug}" aura-router-link>
        <div class="when">${when}</div>
        <strong>${name}</strong>
        <div class="hint">${hint}</div>
      </a>
    </li>`,
    )
    .join('');
  page(
    `chronicle/${id}.html`,
    era.title,
    `
    <p class="hint">Обзор эпохи</p>
    <h2>${era.title}</h2>
    <p class="lede">${era.lede}</p>
    <ol class="timeline">${list}</ol>
    <div class="actions">
      <a class="btn" href="/chronicle/${id}/${era.items[0][2]}" aura-router-link>К первому событию</a>
      <a class="btn ghost" href="/" aura-router-link>В ЦУП</a>
    </div>
  `,
  );
}

const events = [
  [
    'tsiolkovsky',
    'Циолковский',
    'Мечта',
    'Константин Циолковский формулирует идею жидкостной ракеты и космических кораблей. Наука о полёте начинается на бумаге.',
    '/chronicle/dawn',
    'К рассвету',
    '/fleet',
    'К флоту',
  ],
  [
    'sputnik',
    'Спутник-1',
    '4 октября 1957',
    'Первый искусственный спутник Земли. Простой шар с антеннами — и новый век.',
    '/chronicle/flight',
    'К эпохе полёта',
    '/system/earth',
    'К Земле',
  ],
  [
    'gagarin',
    'Юрий Гагарин',
    '12 апреля 1961',
    'Корабль «Восток-1» выводит первого человека на орбиту. Полёт длится 108 минут — и пересобирает представление о возможном.',
    '/system/earth/missions/vostok-1',
    'Миссия Восток-1',
    '/fleet/vostok',
    'Корабль «Восток»',
  ],
  [
    'tereshkova',
    'Валентина Терешкова',
    '16 июня 1963',
    '«Восток-6»: первая женщина в космосе. Орбита становится чуть менее исключительной привилегией.',
    '/chronicle/flight',
    'К эпохе полёта',
    '/fleet/vostok',
    'К «Востоку»',
  ],
  [
    'leonov',
    'Алексей Леонов',
    '18 марта 1965',
    'Выход в открытый космос с корабля «Восход-2». Скафандр, шлюз, Земля под ногами — буквально.',
    '/chronicle/orbit',
    'К эпохе орбиты',
    '/fleet',
    'К флоту',
  ],
  [
    'salyut',
    'Салют',
    '1971+',
    'Серия орбитальных станций. Люди учатся жить на орбите не часы, а недели и месяцы.',
    '/mir',
    'К станции «Мир»',
    '/chronicle/orbit/mir',
    'К запуску «Мира»',
  ],
  [
    'mir',
    'Станция «Мир»',
    '20 февраля 1986',
    'Базовый блок на орбите. Дальше — стыковки модулей и пятнадцать лет непрерывной жизни над планетой.',
    '/mir',
    'Войти на «Мир»',
    '/mir/modules/base',
    'Базовый блок',
  ],
];

for (const [id, name, when, text, a, al, b, bl] of events) {
  page(
    `chronicle/events/${id}.html`,
    name,
    `
    <span class="tag">${when}</span>
    <h2>${name}</h2>
    <p class="lede">${text}</p>
    <div class="actions">
      <a class="btn" href="${a}" aura-router-link>${al}</a>
      <a class="btn ghost" href="${b}" aura-router-link>${bl}</a>
    </div>
  `,
  );
}

const bodies = [
  [
    'earth',
    'Земля',
    'Дом и стартовая площадка. Все пилотируемые старты XX века начинаются здесь.',
    [['vostok-1', 'Восток-1', '1961 · первый человек на орбите', true]],
  ],
  [
    'moon',
    'Луна',
    'Ближайший сосед. Мягкие посадки, луноходы и грунт в капсулах.',
    [['luna-9', 'Луна-9', '1966 · первая мягкая посадка']],
  ],
  [
    'venus',
    'Венера',
    'Ад под облаками. Советские аппараты впервые передали данные с поверхности.',
    [['venera-7', 'Венера-7', '1970 · первая посадка на другую планету']],
  ],
  [
    'mars',
    'Марс',
    'Красная цель. «Марс-3» достиг поверхности — шаг, который дорого дался.',
    [['mars-3', 'Марс-3', '1971 · первая мягкая посадка на Марс']],
  ],
];

for (const [id, name, lede, missions] of bodies) {
  const cards = missions
    .map(
      ([mid, title, hint, primary]) => `
    <a class="card ${primary ? 'is-primary-path' : ''}" href="/system/${id}/missions/${mid}" aura-router-link>
      <span class="tag">Экспедиция</span>
      <h3>${title}</h3>
      <p>${hint}</p>
    </a>`,
    )
    .join('');
  const map = bodies
    .map(
      ([bid, bname]) => `
    <a class="planet-chip" data-body="${bid}" href="/system/${bid}" aura-router-link>${bname}</a>`,
    )
    .join('');
  page(
    `system/${id}.html`,
    name,
    `
    <p class="hint">Тело Солнечной системы</p>
    <h2>${name}</h2>
    <p class="lede">${lede}</p>
    <div class="system-map" aria-label="Карта выбора">${map}</div>
    <h3 class="section-title">Экспедиции</h3>
    <div class="card-grid">${cards}</div>
    <div class="actions">
      <a class="btn" href="/system/${id}/missions/${missions[0][0]}" aura-router-link>К первой миссии</a>
      <a class="btn ghost" href="/fleet" aura-router-link>Флот</a>
    </div>
  `,
  );
}

const missions = [
  [
    'vostok-1',
    'Восток-1',
    '12 апреля 1961',
    'Земля',
    'Юрий Гагарин · 108 минут на орбите. Один виток — и статус человечества меняется.',
    '/chronicle/flight/gagarin',
    'Событие в хронике',
    '/fleet/vostok',
    'Корабль',
  ],
  [
    'luna-9',
    'Луна-9',
    '3 февраля 1966',
    'Луна',
    'Первая мягкая посадка на Луну и панорамы с поверхности.',
    '/system/moon',
    'К Луне',
    '/fleet/lunokhod',
    'К луноходам',
  ],
  [
    'venera-7',
    'Венера-7',
    '15 декабря 1970',
    'Венера',
    'Первый аппарат, передавший данные с поверхности другой планеты.',
    '/system/venus',
    'К Венере',
    '/fleet',
    'Флот',
  ],
  [
    'mars-3',
    'Марс-3',
    '2 декабря 1971',
    'Марс',
    'Мягкая посадка на Марс. Сигнал с поверхности был коротким — но историческим.',
    '/system/mars',
    'К Марсу',
    '/deep/solar',
    'К масштабам',
  ],
];

for (const [id, name, when, where, text, a, al, b, bl] of missions) {
  page(
    `system/missions/${id}.html`,
    name,
    `
    <span class="tag">Миссия</span>
    <h2>${name}</h2>
    <div class="meta-row"><span><strong>Дата:</strong> ${when}</span><span><strong>Цель:</strong> ${where}</span></div>
    <p class="lede">${text}</p>
    <div class="actions">
      <a class="btn" href="${a}" aura-router-link>${al}</a>
      <a class="btn ghost" href="${b}" aura-router-link>${bl}</a>
    </div>
  `,
  );
}

page(
  'mir.html',
  'Станция Мир',
  `
  <h2>Орбитальный дом</h2>
  <p class="lede">«Мир» собирали в полёте: базовый блок и научные модули. Выберите отсек на схеме слева — и читайте, зачем он был нужен.</p>
  <div class="card-grid">
    <a class="card is-primary-path" href="/mir/modules/base" aura-router-link>
      <span class="tag">Старт обхода</span>
      <h3>Базовый блок</h3>
      <p>Жилой и командный центр комплекса.</p>
    </a>
    <a class="card" href="/chronicle/orbit/mir" aura-router-link>
      <span class="tag">Хроника</span>
      <h3>Запуск 1986</h3>
      <p>Как станция появилась на орбите.</p>
    </a>
  </div>
`,
);

const modules = [
  [
    'base',
    'Базовый блок',
    '1986',
    'Сердце станции: жилые каюты, пост управления, узлы стыковки. Отсюда начинался весь комплекс.',
    '/mir/modules/kvant',
    'Дальше: Квант',
  ],
  [
    'kvant',
    'Квант',
    '1987',
    'Первый научный модуль: астрофизика, эксперименты, дооснащение энергосистемы.',
    '/mir/modules/kvant-2',
    'Дальше: Квант-2',
  ],
  [
    'kvant-2',
    'Квант-2',
    '1989',
    'Шлюзовой отсек, системы жизнеобеспечения, научная аппаратура. Ворота для выходов.',
    '/mir/modules/kristall',
    'Дальше: Кристалл',
  ],
  [
    'kristall',
    'Кристалл',
    '1990',
    'Материаловедение, биотехнологии, стыковочный узел для кораблей «Буран» / «Спейс шаттл».',
    '/mir/modules/spektr',
    'Дальше: Спектр',
  ],
  [
    'spektr',
    'Спектр',
    '1995',
    'Дистанционное зондирование Земли, геофизика, дополнительные солнечные батареи.',
    '/mir/modules/priroda',
    'Дальше: Природа',
  ],
  [
    'priroda',
    'Природа',
    '1996',
    'Последний модуль: экология Земли, исследования атмосферы и поверхности.',
    '/deep/milky-way',
    'К Млечному Пути',
  ],
];

for (const [id, name, when, text, next, nextLabel] of modules) {
  page(
    `mir/${id}.html`,
    name,
    `
    <span class="tag">Модуль · ${when}</span>
    <h2>${name}</h2>
    <p class="lede">${text}</p>
    <div class="actions">
      <a class="btn" href="${next}" aura-router-link>${nextLabel}</a>
      <a class="btn ghost" href="/mir" aura-router-link>К схеме</a>
    </div>
  `,
  );
}

const scales = [
  [
    'solar',
    'Солнечная система',
    '~2 св. года до границы гелиосферы',
    'Планеты, пояса, гелиосфера — наш «дворик». Дальше ветер Солнца слабеет.',
    '/deep/oort',
    'Дальше: облако Оорта',
  ],
  [
    'oort',
    'Облако Оорта',
    'тысячи а.е.',
    'Сферическое облако кометных тел на окраине солнечного влияния. Край «своего» космоса.',
    '/deep/milky-way',
    'Дальше: галактика',
  ],
  [
    'milky-way',
    'Млечный Путь',
    '~100 тыс. св. лет',
    'Наша галактика: сотни миллиардов звёзд, рукава, центральная перемычка. Солнце — одна из точек на окраине.',
    '/deep/local-group',
    'Дальше: местная группа',
  ],
  [
    'local-group',
    'Местная группа',
    '~10 млн св. лет',
    'Млечный Путь, Андромеда, Треугольник и карликовые соседи — связанная гравитацией семья.',
    '/deep/observable',
    'Дальше: Вселенная',
  ],
  [
    'observable',
    'Наблюдаемая Вселенная',
    '~93 млрд св. лет в диаметре',
    'Сфера, из которой свет успел дойти до нас. За её краем — не «конец мира», а предел сигнала.',
    '/deep/horizon',
    'За горизонт',
  ],
];

for (const [id, name, scale, text, next, nextLabel] of scales) {
  page(
    `deep/${id}.html`,
    name,
    `
    <span class="tag">${scale}</span>
    <h2>${name}</h2>
    <p class="lede">${text}</p>
    <div class="actions">
      <a class="btn" href="${next}" aura-router-link>${nextLabel}</a>
      <a class="btn ghost" href="/briefing" aura-router-link>Получить позывной</a>
    </div>
  `,
  );
}

page(
  'deep/horizon.html',
  'За горизонтом',
  `
  <div class="horizon-panel">
    <h2>За горизонтом сигнала</h2>
    <p class="lede">Карты кончаются там, куда ещё не дошёл свет. Здесь атлас ставит многоточие — и напоминает, что маршруты роутера тоже умеют охранять границы.</p>
    <p class="hint">Вы прошли экспедицию: время → система → станция → глубина.</p>
    <div class="actions">
      <a class="btn" href="/" aura-router-link>Вернуться в ЦУП</a>
      <a class="btn ghost" href="/fleet" aura-router-link>Флот</a>
      <button type="button" class="btn ghost" data-callsign-reset>Сбросить позывной</button>
    </div>
  </div>
`,
);

console.log('OK: content pages written');

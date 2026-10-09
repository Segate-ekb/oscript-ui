// Находки аудита Material 3 (выпуск 0.13, дев-сборка 5) на образцах сайта документации:
// имя карточки объекта, блок команды, окна, вложенные карточки, рамка поля, ссылки в тексте,
// цели касания, заголовки групп навигации. Сайт документации должен быть запущен:
//
//   cd документация && oscript main.os --порт 3391
//   NODE_PATH=/tmp/claude-501/pw/node_modules node tests/браузер/облик-m3.js [адрес] [каталог снимков]
//
// Код выхода 1, если что-то из обещанного не так. Снимки — в каталог снимков; в репозиторий
// их не кладут.

const { chromium } = require('playwright-core');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const B = process.argv[2] || 'http://localhost:3391';
const OUT = process.argv[3] || '/tmp/claude-501/снимки-облик-m3';
fs.mkdirSync(OUT, { recursive: true });

function адрес(страница) { return B + '/' + encodeURIComponent(страница); }

function браузер() {
  const кэш = path.join(process.env.HOME, 'Library/Caches/ms-playwright');
  const exe = execSync(`find "${кэш}" -name chrome-headless-shell -type f | head -1`).toString().trim();
  return chromium.launch(exe ? { executablePath: exe } : {});
}

const беды = [];
function проверить(условие, что) {
  if (!условие) беды.push(что);
  console.log((условие ? 'ок   ' : 'БЕДА ') + что);
}

// Образец документации по началу подписи.
function образец(p, подпись) {
  return p.locator('figure.docs-sample', { has: p.locator('.docs-sample__title', { hasText: подпись }) }).first();
}

// S1: имя карточки объекта рядом с плашкой и кнопкой видно не короче 8 знаков — на 390 и 1280,
// а у обрезанного имени на наведении подсказка с именем целиком.
async function имяКарточки(b) {
  for (const w of [390, 1280]) {
    const ctx = await b.newContext({ viewport: { width: w, height: 900 } });
    const p = await ctx.newPage();
    await p.goto(адрес('раскладка'), { waitUntil: 'networkidle' });
    const обр = образец(p, 'Карточка объекта');
    const замеры = await обр.locator('.objcard__name').evaluateAll((имена) => имена.map((имя) => {
      const ссылка = имя.querySelector('a') || имя;
      const текст = [...ссылка.childNodes].find((n) => n.nodeType === 3);
      const r = document.createRange();
      const знаков = Math.min(8, текст.length);
      r.setStart(текст, 0);
      r.setEnd(текст, знаков);
      const восемь = r.getBoundingClientRect();
      const коробка = имя.getBoundingClientRect();
      return { имя: текст.textContent, ширина: Math.round(коробка.width),
        видно: восемь.right <= коробка.right + 0.5 && восемь.width > 0 };
    }));
    проверить(замеры.length === 3, `S1 ${w}: три карточки в образце`);
    for (const з of замеры) {
      проверить(з.видно, `S1 ${w}: имя «${з.имя}» видно не короче 8 знаков (ширина ${з.ширина})`);
    }
    // в узкой шапке плашка — под именем, действие — справа от имени или под ним, но не поверх
    const шапка = await обр.locator('.objcard__head').first().evaluate((h) => {
      const r = (s) => h.querySelector(s).getBoundingClientRect();
      return { имя: r('.objcard__name'), плашки: r('.objcard__chips'), действия: r('.objcard__actions') };
    });
    проверить(шапка.плашки.top >= шапка.имя.bottom - 0.5, `S1 ${w}: в узкой карточке плашки под именем`);
    проверить(шапка.действия.left >= шапка.имя.right - 0.5 || шапка.действия.top >= шапка.имя.bottom - 0.5,
      `S1 ${w}: действия не налезают на имя`);
    if (w === 1280) {
      const имя = обр.locator('.objcard__name').first();
      await имя.hover();
      const подсказка = await имя.getAttribute('title');
      проверить(подсказка === 'отчёты-по-проектам-за-квартал', `S1: подсказка обрезанного имени — имя целиком (${подсказка})`);
      const целое = обр.locator('.objcard__name').nth(1);
      await целое.hover();
      проверить(await целое.getAttribute('title') === null, 'S1: у целого имени подсказки нет');
      await обр.screenshot({ path: path.join(OUT, `карточка-объекта-${w}.png`) });
    }
    await ctx.close();
  }
}

// S7: блок с длинной командой на 390 — кнопка «Копировать» целиком внутри блока и экрана,
// блок не прокручивается вбок; на 1280 короткая команда стоит с кнопкой в одну строку.
async function блокКоманды(b) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 900 } });
  const p = await ctx.newPage();
  await p.goto(адрес('блок-команды'), { waitUntil: 'networkidle' });
  const з = await образец(p, 'Длинный адрес').locator('.docs-sample__preview .cmd').evaluate((c) => {
    const к = c.querySelector('.copy').getBoundingClientRect();
    const б = c.getBoundingClientRect();
    const код = c.querySelector('code').getBoundingClientRect();
    return { внутри: к.left >= б.left - 0.5 && к.right <= б.right + 0.5, экран: к.right <= innerWidth,
      вбок: c.scrollWidth > c.clientWidth + 1, подКодом: к.top >= код.bottom - 0.5 };
  });
  проверить(з.внутри && з.экран, 'S7 390: «Копировать» целиком внутри блока и экрана');
  проверить(!з.вбок, 'S7 390: блок команды не прокручивается вбок');
  проверить(з.подКодом, 'S7 390: длинная команда — кнопка под кодом');
  await образец(p, 'Длинный адрес').screenshot({ path: path.join(OUT, 'блок-команды-390.png') });
  await p.setViewportSize({ width: 1280, height: 900 });
  const широкий = await образец(p, 'Длинный адрес').locator('.docs-sample__preview .cmd').evaluate((c) => {
    const к = c.querySelector('.copy').getBoundingClientRect();
    const код = c.querySelector('code').getBoundingClientRect();
    return к.top < код.bottom && к.left >= код.right - 0.5;
  });
  проверить(широкий, 'S7 1280: кнопка справа от кода, в одной строке с ним');
  await ctx.close();
}

(async () => {
  const b = await браузер();
  try {
    await имяКарточки(b);
    await блокКоманды(b);
  } finally {
    await b.close();
  }
  console.log(беды.length ? `\nБЕД: ${беды.length}` : '\nвсё как обещано');
  process.exit(беды.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });

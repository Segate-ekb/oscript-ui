// Полные ряды сетки карточек (выпуск 0.13, дев-сборка 6; замечание владельца к превью 2, п. 4):
// восемь карточек в Колонки(4).ПолныеРяды() на образце страницы «Сетка» ложатся только полными
// рядами — 8 по четыре на 1280, 6 по три на 900, 8 по две на 600, 8 по одной на 390. Сайт
// документации должен быть запущен:
//
//   cd документация && oscript main.os --порт 3391
//   NODE_PATH=/tmp/claude-501/pw/node_modules node tests/браузер/полные-ряды.js [адрес] [каталог снимков]
//
// Код выхода 1, если что-то из обещанного не так. Снимки — в каталог снимков; в репозиторий
// их не кладут.

const { chromium } = require('playwright-core');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const B = process.argv[2] || 'http://localhost:3391';
const OUT = process.argv[3] || '/tmp/claude-501/снимки-полные-ряды';
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

function образец(p, подпись) {
  return p.locator('figure.docs-sample', { has: p.locator('.docs-sample__title', { hasText: подпись }) }).first();
}

// Видимые ячейки сетки и их ряды: ряд — общая верхняя граница.
async function замер(обр) {
  return обр.locator('.grid--full-rows').first().evaluate((g) => {
    const видимые = [...g.children].filter((c) => getComputedStyle(c).display !== 'none');
    const ряды = new Map();
    for (const c of видимые) {
      const верх = Math.round(c.getBoundingClientRect().top);
      ряды.set(верх, (ряды.get(верх) || 0) + 1);
    }
    return { всего: g.children.length, видно: видимые.length, ряды: [...ряды.values()] };
  });
}

(async () => {
  const b = await браузер();
  const ждём = [
    { w: 1280, видно: 8, вРяду: 4 },
    { w: 900, видно: 6, вРяду: 3 },
    { w: 600, видно: 8, вРяду: 2 },
    { w: 390, видно: 8, вРяду: 1 },
  ];
  for (const ж of ждём) {
    const ctx = await b.newContext({ viewport: { width: ж.w, height: 900 }, javaScriptEnabled: ж.w !== 900 });
    const p = await ctx.newPage();
    await p.goto(адрес('сетка'), { waitUntil: 'networkidle' });
    const обр = образец(p, 'Восемь карточек в четырёх колонках');
    const з = await замер(обр);
    проверить(з.всего === 8, `${ж.w}: в разметке восемь карточек (${з.всего})`);
    проверить(з.видно === ж.видно, `${ж.w}: видно ${ж.видно} (${з.видно})`
      + (ж.w === 900 ? ' — без скрипта' : ''));
    проверить(з.ряды.every((n) => n === ж.вРяду), `${ж.w}: все ряды по ${ж.вРяду} (${з.ряды.join(' + ')})`);
    await обр.screenshot({ path: path.join(OUT, `полные-ряды-${ж.w}.png`) });
    await ctx.close();
  }
  await b.close();
  if (беды.length) {
    console.log(`\n${беды.length} бед`);
    process.exit(1);
  }
  console.log('\nвсё ок');
})().catch((e) => { console.error(e); process.exit(1); });

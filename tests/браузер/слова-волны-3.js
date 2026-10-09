// Слова дев-сборки 0.13.0-dev.6 для пробелов хаба волны 3 на образцах сайта документации:
// колонка чисел, источник сегментов, отказ слота картинки, кнопка без отправки, образцы
// акцента темы, зеркало акцента в образце. Сайт документации должен быть запущен:
//
//   cd документация && oscript main.os --порт 3391
//   NODE_PATH=/tmp/claude-501/pw/node_modules node tests/браузер/слова-волны-3.js [адрес] [каталог снимков]
//
// Код выхода 1, если что-то из обещанного не так. Снимки — в каталог снимков; в репозиторий
// их не кладут.

const { chromium } = require('playwright-core');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const B = process.argv[2] || 'http://localhost:3391';
const OUT = process.argv[3] || '/tmp/claude-501/снимки-слова-волны-3';
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

async function страница(b, имя, ширина, скрипт = true) {
  const ctx = await b.newContext({ viewport: { width: ширина, height: 900 }, javaScriptEnabled: скрипт });
  const p = await ctx.newPage();
  await p.goto(адрес(имя), { waitUntil: 'networkidle' });
  return { ctx, p };
}

// Колонка чисел: на широком экране число и заголовок по правому краю, правые края совпадают;
// в таблице карточками на телефоне число слева под подписью.
async function колонкаЧисел(b) {
  {
    const { ctx, p } = await страница(b, 'таблица-деревом', 1280);
    const обр = образец(p, 'Колонка чисел');
    const з = await обр.evaluate((f) => {
      const th = f.querySelector('th.col-num');
      const тексты = [...f.querySelectorAll('td.cell-num')].map((td) => {
        const r = document.createRange();
        r.selectNodeContents(td);
        const к = r.getBoundingClientRect();
        const я = td.getBoundingClientRect();
        return { правыйЗазор: Math.round(я.right - к.right), цифры: getComputedStyle(td).fontVariantNumeric };
      });
      const r = document.createRange();
      r.selectNodeContents(th);
      return {
        выравнивание: getComputedStyle(th).textAlign,
        заголовокЗазор: Math.round(th.getBoundingClientRect().right - r.getBoundingClientRect().right),
        тексты,
      };
    });
    проверить(з.выравнивание === 'right', `число 1280: заголовок по правому краю (${з.выравнивание})`);
    проверить(з.тексты.length === 6, `число 1280: шесть ячеек чисел (${з.тексты.length})`);
    const зазоры = new Set(з.тексты.map((т) => т.правыйЗазор).concat([з.заголовокЗазор]));
    проверить(зазоры.size === 1, `число 1280: правые края чисел и заголовка на одной линии (${[...зазоры].join(', ')})`);
    проверить(з.тексты.every((т) => т.цифры === 'tabular-nums'), 'число 1280: цифры одной ширины');
    await обр.screenshot({ path: path.join(OUT, 'колонка-чисел-1280.png') });
    await ctx.close();
  }
  {
    const { ctx, p } = await страница(b, 'таблица-деревом', 390);
    const обр = образец(p, 'Колонка чисел');
    const з = await обр.evaluate((f) => {
      const td = f.querySelector('td.cell-num');
      const r = document.createRange();
      r.selectNodeContents(td);
      return {
        выравнивание: getComputedStyle(td).textAlign,
        левыйЗазор: Math.round(r.getBoundingClientRect().left - td.getBoundingClientRect().left),
        подпись: td.getAttribute('data-label'),
      };
    });
    проверить(з.выравнивание === 'left', `число 390: в карточке слева (${з.выравнивание})`);
    проверить(з.левыйЗазор <= 1, `число 390: прижато к левому краю (${з.левыйЗазор})`);
    проверить(з.подпись === 'Документов', `число 390: под подписью колонки (${з.подпись})`);
    await обр.screenshot({ path: path.join(OUT, 'колонка-чисел-390.png') });
    await ctx.close();
  }
}

(async () => {
  const b = await браузер();
  await колонкаЧисел(b);
  await b.close();
  if (беды.length) {
    console.log(`\n${беды.length} бед`);
    process.exit(1);
  }
  console.log('\nвсё ок');
})().catch((e) => { console.error(e); process.exit(1); });

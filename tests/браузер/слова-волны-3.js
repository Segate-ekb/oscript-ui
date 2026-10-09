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

// Источник сегментов: справа на строке подписи группы, пилюля под ними; на 390 — так же.
async function источникСегментов(b) {
  for (const w of [1280, 390]) {
    const { ctx, p } = await страница(b, 'сегменты', w);
    const обр = образец(p, 'Тема и откуда она взялась');
    const з = await обр.evaluate((f) => {
      const r = (s) => f.querySelector(s).getBoundingClientRect();
      const группа = f.querySelector('.segments');
      return {
        подпись: r('fieldset > legend'), источник: r('.segments__origin'), пилюля: r('.segments'),
        рамка: r('fieldset'),
        описана: группа.getAttribute('aria-describedby') === f.querySelector('.segments__origin').id,
      };
    });
    проверить(Math.abs(з.источник.top - з.подпись.top) <= 4, `сегменты ${w}: источник на строке подписи группы (${Math.round(з.источник.top - з.подпись.top)})`);
    проверить(з.источник.left >= з.подпись.right, `сегменты ${w}: источник справа от подписи`);
    проверить(Math.abs(з.источник.right - з.рамка.right) <= 1, `сегменты ${w}: источник у правого края группы`);
    проверить(з.пилюля.top >= Math.max(з.подпись.bottom, з.источник.bottom) - 0.5, `сегменты ${w}: пилюля под подписью и источником`);
    проверить(з.описана, `сегменты ${w}: группа ссылается на источник aria-describedby`);
    await обр.screenshot({ path: path.join(OUT, `источник-сегментов-${w}.png`) });
    await ctx.close();
  }
}

// Отказ слота картинки: файл не картинки уходит тихо, сервер отвечает 422 со слотом с отказом,
// и отказ встаёт под строкой состояния цветом ошибки; поле помечено негодным. Страница не
// перезагружается.
async function отказСлота(b) {
  const файл = path.join(require('os').tmpdir(), 'отчёт-проба.txt');
  fs.writeFileSync(файл, 'не картинка');
  const { ctx, p } = await страница(b, 'образец-картинки', 1280);
  await p.evaluate(() => { window.__та_же = true; });
  const ответы = [];
  p.on('response', (r) => { if (r.request().method() === 'POST') ответы.push(r.status()); });
  await p.setInputFiles('#slot-logo .imgslot__file', файл);
  await p.waitForSelector('#slot-logo .imgslot__error', { timeout: 8000 }).catch(() => {});
  const з = await p.evaluate(() => {
    const о = document.querySelector('#slot-logo .imgslot__error');
    const поле = document.querySelector('#slot-logo .imgslot__file');
    const с = document.querySelector('#slot-logo .imgslot__state');
    return {
      текст: о ? о.textContent : '', цвет: о ? getComputedStyle(о).color : '',
      ошибка: getComputedStyle(document.documentElement).getPropertyValue('--md-sys-color-error').trim(),
      недействительно: поле.getAttribute('aria-invalid'), описание: поле.getAttribute('aria-describedby'),
      подСостоянием: о && с ? о.getBoundingClientRect().top >= с.getBoundingClientRect().bottom - 0.5 : false,
      таЖе: window.__та_же === true,
    };
  });
  проверить(ответы.includes(422), `слот: сервер ответил отказом 422 (${ответы.join(', ')})`);
  проверить(/отчёт-проба\.txt.*не картинка/.test(з.текст), `слот: отказ под слотом словами («${з.текст}»)`);
  проверить(з.подСостоянием, 'слот: отказ под строкой состояния');
  проверить(з.недействительно === 'true' && /-error/.test(з.описание || ''), `слот: поле негодно и описано отказом (${з.описание})`);
  проверить(з.таЖе, 'слот: отказ лёг на страницу без перезагрузки');
  await p.locator('#slot-logo').screenshot({ path: path.join(OUT, 'отказ-слота-1280.png') });
  await ctx.close();
}

// Кнопка без отправки: щелчок по кнопке образца в форме не шлёт форму и не уводит со страницы.
async function кнопкаБезОтправки(b) {
  const { ctx, p } = await страница(b, 'кнопка', 1280);
  const обр = образец(p, 'кнопка образца не отправляет форму');
  const до = p.url();
  const запросы = [];
  p.on('request', (r) => { if (r.method() === 'POST') запросы.push(r.url()); });
  const кнопка = обр.locator('.preview button').first();
  проверить(await кнопка.getAttribute('type') === 'button', 'без отправки: type="button"');
  await кнопка.click();
  await p.waitForTimeout(600);
  проверить(запросы.length === 0, `без отправки: форма не ушла (${запросы.length})`);
  проверить(p.url() === до, 'без отправки: страница та же');
  await ctx.close();
}

// Палитра акцента кита: поле печатает шесть кружков с именами из словаря, выбранный — зелёный;
// щелчок по кружку пишет его код в поле и имя рядом.
async function палитраАкцента(b) {
  const { ctx, p } = await страница(b, 'поле', 1280);
  const обр = образец(p, 'Акцент из палитры кита');
  const з = await обр.evaluate((f) => ({
    имена: [...f.querySelectorAll('.swatches__item:not(.swatches__item--default):not(.swatches__item--own)')]
      .map((l) => l.getAttribute('title')),
    видно: !f.querySelector('[data-swatches-row]').hidden,
    имя: f.querySelector('[data-swatches-name]').textContent,
  }));
  проверить(з.имена.join(',') === 'Лаванда,Синий,Зелёный,Янтарный,Красный,Серый', `палитра: шесть кружков с именами (${з.имена.join(',')})`);
  проверить(з.видно, 'палитра: со скриптом ряд виден');
  проверить(з.имя === 'Зелёный', `палитра: выбран зелёный (${з.имя})`);
  await обр.locator('.swatches__item[title="Красный"]').click();
  const после = await обр.evaluate((f) => ({
    код: f.querySelector('.swatches__code').value, имя: f.querySelector('[data-swatches-name]').textContent,
  }));
  проверить(после.код === '#e5484d' && после.имя === 'Красный', `палитра: щелчок по красному пишет код и имя (${после.код} ${после.имя})`);
  await обр.locator('.docs-sample__view, .docs-sample__body').first().screenshot({ path: path.join(OUT, 'палитра-акцента-1280.png') }).catch(() => обр.screenshot({ path: path.join(OUT, 'палитра-акцента-1280.png') }));
  await ctx.close();
}

// Зеркало акцента: сервер напечатал красный — основная кнопка образца красная, текст на ней
// контрастный; выбор зелёного кружка перекрашивает кнопку и плашку, кнопка страницы вокруг —
// в своём акценте; «по умолчанию» возвращает акцент рамки.
async function зеркалоАкцента(b) {
  const { ctx, p } = await страница(b, 'образец', 1280);
  const обр = образец(p, 'Акцент перекрашивает кнопку и плашку образца');
  const цвета = () => обр.evaluate((f) => {
    // цвет слоями color-mix() движок отдаёт в своём пространстве — сводим к rgb пикселем холста
    const к = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
    const rgb = (c) => { к.clearRect(0, 0, 1, 1); к.fillStyle = c; к.fillRect(0, 0, 1, 1); const d = к.getImageData(0, 0, 1, 1).data; return `rgb(${d[0]},${d[1]},${d[2]})`; };
    const bg = (el) => rgb(getComputedStyle(el).backgroundColor);
    const кнопка = f.querySelector('.preview .button--primary');
    return {
      кнопка: bg(кнопка), текст: rgb(getComputedStyle(кнопка).color),
      плашка: bg(f.querySelector('.preview .tag--accent')),
      снаружи: bg(f.querySelector('form .button--primary')),
    };
  });
  const норм = (c) => c.replace(/\s+/g, '');
  const до = await цвета();
  проверить(норм(до.кнопка) === 'rgb(229,72,77)', `акцент: сервер напечатал красный — кнопка образца красная (${до.кнопка})`);
  проверить(норм(до.текст) === 'rgb(0,0,0)', `акцент: текст на светлом красном — чёрный (${до.текст})`);
  проверить(норм(до.снаружи) !== норм(до.кнопка), 'акцент: кнопка формы вокруг — в своём акценте');
  await обр.locator('.swatches__item[title="Синий"]').click();
  await p.waitForTimeout(500);
  const синий = await цвета();
  проверить(норм(синий.кнопка) === 'rgb(79,134,247)', `акцент: выбор синего перекрашивает кнопку (${синий.кнопка})`);
  проверить(норм(синий.плашка) !== норм(до.плашка), 'акцент: и плашку accent');
  await обр.screenshot({ path: path.join(OUT, 'зеркало-акцента-1280.png') });
  await обр.locator('.swatches__item--default').click();
  await p.waitForTimeout(500);
  const умолч = await цвета();
  проверить(норм(умолч.кнопка) !== 'rgb(79,134,247)', `акцент: «по умолчанию» возвращает акцент рамки (${умолч.кнопка})`);
  await ctx.close();
}

(async () => {
  const b = await браузер();
  await колонкаЧисел(b);
  await источникСегментов(b);
  await отказСлота(b);
  await кнопкаБезОтправки(b);
  await палитраАкцента(b);
  await зеркалоАкцента(b);
  await b.close();
  if (беды.length) {
    console.log(`\n${беды.length} бед`);
    process.exit(1);
  }
  console.log('\nвсё ок');
})().catch((e) => { console.error(e); process.exit(1); });

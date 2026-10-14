// Слова дев-сборки 0.13.0-dev.10 на образцах сайта документации: три режима ветки дерева галок
// с массовыми галками (/образец-получателей — со скриптом и без), страница ветки без скрипта
// с режимом и запертыми детьми, сегменты режима строкой на телефоне в окне. Сайт документации
// должен быть запущен:
//
//   cd документация && oscript main.os --порт 3612
//   NODE_PATH=<каталог>/node_modules node tests/браузер/слова-дев-10.js [адрес] [каталог снимков]
//
// Код выхода 1, если что-то из обещанного не так. Снимки — в каталог снимков; в репозиторий
// их не кладут.

const { chromium } = require('playwright-core');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const B = process.argv[2] || process.env.BASE || 'http://localhost:3612';
const OUT = process.argv[3] || '/tmp/claude-501/снимки-слова-дев-10';
const КУКА = 'oscript_ui_docs';
fs.mkdirSync(OUT, { recursive: true });

function адрес(страница) { return B + '/' + encodeURIComponent(страница); }
const ПОЛУЧАТЕЛИ = адрес('образец-получателей');

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

async function контекст(b, ширина, скрипт = true, тема = 'светлая', высота = 900) {
  const ctx = await b.newContext({ viewport: { width: ширина, height: высота }, javaScriptEnabled: скрипт });
  await ctx.addCookies([{ name: КУКА, value: encodeURIComponent('тема=' + тема), url: B }]);
  return ctx;
}

async function снимок(локатор, имя) {
  await локатор.page().waitForTimeout(300);
  await локатор.screenshot({ path: path.join(OUT, `${имя}.png`) });
}

function образец(p, подпись) {
  return p.locator('figure.docs-sample', { has: p.locator('.docs-sample__title', { hasText: подпись }) }).first();
}

const плашки = (p) => p.locator('[data-checktree-edits] .chips-in__text').allTextContents();
const ветка = (p, ключ) => p.locator(`[data-checktree-page="${ключ}"]`).first();
const сегмент = (p, ключ, значение) => p.locator(`[data-checktree-modes="${ключ}"] label:has(input[value="${значение}"])`).first();

// Галки детей ветки: отмечены ли, заперты ли (disabled + признак запора).
async function дети(p, ключ) {
  return ветка(p, ключ).evaluate((el) => [...el.querySelectorAll(':scope > li > .checktree__row [data-checktree-box]')].map((x) => ({
    имя: x.name, вкл: x.checked, заперт: x.disabled && x.hasAttribute('data-checktree-locked'),
  })));
}
const всеВкл = (д) => д.length > 0 && д.every((x) => x.вкл);
const всеВыкл = (д) => д.length > 0 && д.every((x) => !x.вкл);
const всеЗаперты = (д) => д.length > 0 && д.every((x) => x.заперт);
const всеОтперты = (д) => д.length > 0 && д.every((x) => !x.заперт);

async function раскрыть(p, ключ) {
  await p.locator(`[data-checktree-page=""] > li:has([data-checktree-modes="${ключ}"]) > details > summary`).first().click();
}

// П15: три режима с массовыми галками — со скриптом
async function режимыСоСкриптом(b) {
  const ctx = await контекст(b, 1280);
  const p = await ctx.newPage();
  let тело = '';
  p.on('request', (r) => { if (r.method() === 'POST') тело = r.postData() || ''; });
  await p.goto(ПОЛУЧАТЕЛИ, { waitUntil: 'networkidle' });

  проверить(await p.locator('[data-checktree-modes="delta"] input').count() === 3, 'П15: у ветки три режима');
  await раскрыть(p, 'delta');
  let д = await дети(p, 'delta');
  проверить(всеВкл(д) && всеЗаперты(д), `П15: «все» — дети отмечены и заперты (${д.length})`);

  await сегмент(p, 'delta', 'выбранные').click();
  д = await дети(p, 'delta');
  проверить(всеВкл(д) && всеОтперты(д), 'П15: «все» → «выбранные» — все отмечены, отперты');
  await p.locator('[data-checktree] [name="delta-002"]').uncheck();
  let ряд = await плашки(p);
  проверить(ряд.some((т) => т.startsWith('Дельта: ')) && ряд.filter((т) => т.startsWith('− ')).length === 1,
    `П15: правка режима и снятый лишний (${ряд.join(' | ')})`);

  await сегмент(p, 'delta', 'никакие').click();
  д = await дети(p, 'delta');
  проверить(всеВыкл(д) && всеЗаперты(д), 'П15: «никакие» — все сняты и заперты');
  ряд = await плашки(p);
  проверить(ряд.filter((т) => т.startsWith('− ') || т.startsWith('+ ')).length === 0, `П15: «никакие» — правок детей нет (${ряд.join(' | ')})`);

  await сегмент(p, 'delta', 'выбранные').click();
  д = await дети(p, 'delta');
  проверить(всеВыкл(д) && всеОтперты(д), 'П15: «никакие» → «выбранные» — все сняты, отперты');
  await p.locator('[data-checktree] [name="delta-001"]').check();
  await p.locator('[data-checktree] [name="delta-004"]').check();
  await p.locator('[data-checktree] [name="delta-004"]').uncheck();
  ряд = await плашки(p);
  проверить(ряд.filter((т) => т.startsWith('+ ')).length === 1, `П15: отмечен нужный, ручные отметки живут (${ряд.join(' | ')})`);

  // ручные отметки внутри «выбранных» не теряются, пока не нажато «все» или «никакие»
  await раскрыть(p, 'alpha');
  await p.locator('[data-checktree] [name="alpha-001"]').uncheck();
  await p.locator('[data-checktree] [name="alpha-003"]').check();
  д = await дети(p, 'alpha');
  проверить(!д.find((x) => x.имя === 'alpha-001').вкл && д.find((x) => x.имя === 'alpha-003').вкл,
    'П15: в «выбранных» ручные отметки стоят');

  // подгруженные позже дети встают по режиму, отмеченному сейчас
  await ветка(p, 'delta').locator('xpath=..').locator('[data-checktree-more] a').first().click();
  await p.waitForFunction(() => document.querySelectorAll('[data-checktree-page="delta"] > li').length > 50);
  д = await дети(p, 'delta');
  const новые = д.slice(50);
  проверить(новые.length === 10 && новые.every((x) => !x.вкл && !x.заперт),
    `П15: страница детей в «выбранных» от «никакие» — сняты, отперты (${новые.length})`);
  await сегмент(p, 'delta', 'все').click();
  д = await дети(p, 'delta');
  проверить(всеВкл(д) && всеЗаперты(д) && д.length === 60, 'П15: «все» запирает и подгруженных');
  await сегмент(p, 'delta', 'никакие').click();
  await сегмент(p, 'delta', 'выбранные').click();
  await p.locator('[data-checktree] [name="delta-001"]').check();
  await снимок(p.locator('[data-checktree-set]').first(), 'п15-режимы-правки-1280');

  await p.locator('button', { hasText: 'Сохранить получателей' }).click();
  await p.waitForSelector('.toast');
  const пары = new URLSearchParams(тело);
  проверить(пары.getAll('режим').includes('delta:выбранные') && пары.getAll('основа').includes('delta:никакие')
    && пары.getAll('включить').includes('delta-001'),
    `П15: ушли режим, основа и отмеченный (${тело.slice(0, 200)})`);
  проверить(!пары.getAll('снять').some((к) => к.startsWith('delta-')), 'П15: снятых в дельте нет — основа «никакие»');
  const тост = await p.locator('.toast').first().textContent();
  проверить(тост.includes('delta — выбранные от «никакие»'), `П15: сервер узнал основу («${тост.trim().slice(0, 160)}»)`);
  await ctx.close();
}

// П15 без скрипта: смена сегмента уходит с формой, основа — из показанного режима
async function режимыБезСкрипта(b) {
  const ctx = await контекст(b, 1280, false);
  const p = await ctx.newPage();
  await p.goto(ПОЛУЧАТЕЛИ, { waitUntil: 'networkidle' });
  await раскрыть(p, 'zeta');
  const д = await дети(p, 'zeta');
  проверить(всеВкл(д) && всеЗаперты(д), 'П15 без скрипта: дети «все» напечатаны отмеченными и запертыми');
  const эп = await (async () => { await раскрыть(p, 'epsilon'); return дети(p, 'epsilon'); })();
  проверить(всеВыкл(эп) && всеЗаперты(эп), 'П15 без скрипта: дети «никакие» — снятыми и запертыми');
  await снимок(p.locator('[data-checktree-set]').first(), 'п15-без-скрипта-1280');
  await сегмент(p, 'zeta', 'выбранные').click();
  await p.locator('button', { hasText: 'Сохранить получателей' }).click({ noWaitAfter: true });
  await p.waitForURL((u) => decodeURIComponent(u.toString()).includes('пришло='), { waitUntil: 'commit' });
  await p.waitForSelector('.toast', { state: 'attached' });
  const тост = await p.locator('.toast').first().textContent();
  проверить(тост.includes('zeta — выбранные от «все»') && !тост.includes('снять zeta'),
    `П15 без скрипта: режим и основа «все», снятых нет («${тост.trim().slice(0, 160)}»)`);
  await ctx.close();
}

(async () => {
  const b = await браузер();
  const шаги = [['режимы со скриптом', режимыСоСкриптом], ['режимы без скрипта', режимыБезСкрипта]];
  for (const [имя, шаг] of шаги) {
    try {
      await шаг(b);
    } catch (err) {
      беды.push(`${имя}: ${err}`);
      console.log(`БЕДА ${имя}: ${err}`);
    }
  }
  await b.close();
  console.log(беды.length ? `\nБЕД: ${беды.length}` : '\nвсё в порядке');
  process.exit(беды.length ? 1 : 0);
})();

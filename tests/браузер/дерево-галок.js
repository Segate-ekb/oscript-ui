// Дерево галок на тысячу пунктов (выпуск 0.13, шаг 23) на образце сайта документации
// (/образец-дерева, 440 участников) и на странице «Дерево галок»: раскрытие и «Показать ещё»
// грузят ветку, поиск заменяет ветки списком совпадений, режим ветки и галки копятся
// плашками правок, отправка отдаёт только правки; «частично» пересчитывает скрипт; без
// скрипта — первые 50, ссылка на страницу ветки и обычная отправка галок.
// Сайт документации должен быть запущен:
//
//   cd документация && oscript main.os --порт 3423
//   NODE_PATH=/tmp/claude-501/pw/node_modules node tests/браузер/дерево-галок.js [адрес] [каталог снимков]
//
// Код выхода 1, если что-то из обещанного не так. Снимки (1280 и 390 px, обе темы) — в каталог
// снимков; в репозиторий их не кладут.

const { chromium } = require('playwright-core');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const B = process.argv[2] || 'http://localhost:3423';
const OUT = process.argv[3] || '/tmp/claude-501/снимки-дерева';
const ОБРАЗЕЦ = B + '/' + encodeURIComponent('образец-дерева');
const СТРАНИЦА = B + '/' + encodeURIComponent('дерево-галок');
const КУКА = 'oscript_ui_docs';
fs.mkdirSync(OUT, { recursive: true });

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

async function пометить(p) { await p.evaluate(() => { window.__метка = 1; }); }
async function безПерезагрузки(p) { return p.evaluate(() => window.__метка === 1); }

const ветка = (p, ключ) => p.locator(`[data-checktree-page="${ключ}"]`).first();
const детей = (p, ключ) => ветка(p, ключ).locator(':scope > li').count();
const плашки = (p) => p.locator('[data-checktree-edits] .chips-in__text').allTextContents();

async function состояние(p, имя) {
  return p.evaluate((имя) => {
    const b = document.querySelector(`[data-checktree] [name="${имя}"]`) || document.querySelector(`[name="${имя}"]`);
    return b ? (b.indeterminate ? 'mixed' : b.checked ? 'on' : 'off') : 'нет';
  }, имя);
}

async function соСкриптом(b) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  const p = await ctx.newPage();
  const запросы = [];
  let тело = '';
  p.on('request', (r) => {
    запросы.push(decodeURIComponent(r.url()));
    if (r.method() === 'POST') тело = r.postData() || '';
  });
  await p.goto(ОБРАЗЕЦ, { waitUntil: 'networkidle' });
  await пометить(p);

  // первые 50 и «Показать ещё»
  проверить(await детей(p, 'alpha') === 50, 'альфа напечатала первые 50 детей');
  await p.locator('[data-checktree-page=""] > li').first().locator('summary').click();
  await p.locator('[data-checktree-more="alpha"] a').click();
  await p.waitForFunction(() => document.querySelectorAll('[data-checktree-page="alpha"] > li').length === 100);
  проверить(await детей(p, 'alpha') === 100, '«Показать ещё» дописало вторую страницу: 100 детей');
  проверить(запросы.some((u) => u.includes('/образец-дерева/ветка?ветка=alpha&страница=2')),
    'страница ветки взята по адресу ?ветка=alpha&страница=2');
  const счёт = await p.locator('[data-checktree-more="alpha"] .checktree__count').textContent();
  проверить(счёт === 'Показано 100 из 140', `строка «Показать ещё» сменилась на следующую («${счёт}»)`);
  const фокус = await p.evaluate(() => document.activeElement && document.activeElement.name);
  проверить(фокус === 'alpha-051', `фокус — на первой новой галке (${фокус})`);
  проверить(await безПерезагрузки(p), 'страница не перезагружалась');

  // раскрытие пустой ветки грузит её детей
  проверить(await детей(p, 'gamma') === 0, 'гамма приехала без детей');
  await p.locator('[data-checktree-page=""] > li').nth(2).locator('summary').click();
  await p.waitForFunction(() => document.querySelectorAll('[data-checktree-page="gamma"] > li').length === 50);
  проверить(await детей(p, 'gamma') === 50, 'раскрытие гаммы загрузило первую страницу');
  проверить(await p.locator('[data-checktree-more="gamma"] a').getAttribute('href').then((h) => decodeURIComponent(h).includes('страница=2')),
    'у гаммы ссылка на вторую страницу');

  // правки галками и режимом — плашками
  await p.locator('[name="alpha-001"]').uncheck();
  await p.locator('[name="alpha-003"]').check();
  const бета = p.locator('[data-checktree-modes="beta"]');
  await бета.locator('label', { hasText: 'Все' }).click();
  let ряд = await плашки(p);
  проверить(ряд.length === 3, `три правки — три плашки (${ряд.join(' | ')})`);
  проверить(ряд.some((т) => т.startsWith('− ')) && ряд.some((т) => т.startsWith('+ ')) && ряд.includes('Бета: Все'),
    'плашки: снять, включить и режим ветки');
  проверить(await p.locator('[data-checktree-edits]').isVisible(), 'ряд правок виден');
  проверить(await ветка(p, 'beta').evaluate((el) => el.inert), 'дети ветки в режиме «все» выведены из фокуса (inert)');

  // любую правку можно снять
  const вторая = p.locator('[data-checktree-edits] [data-checktree-undo]').nth(1);
  await вторая.focus();
  await p.keyboard.press('Enter');
  ряд = await плашки(p);
  проверить(ряд.length === 2 && await состояние(p, 'alpha-003') === 'off', 'крестик снял правку: галка вернулась, плашки нет');
  const наПлашке = await p.evaluate(() => !!(document.activeElement && document.activeElement.hasAttribute('data-checktree-undo')));
  проверить(наПлашке, 'фокус — на соседней плашке');

  // поиск через сервер заменяет ветки списком совпадений
  await p.fill('[data-checktree-search] input', 'анна');
  await p.keyboard.press('Enter');
  await p.waitForSelector('[data-checktree-set] > [data-checktree-found]');
  const найдено = await p.locator('.checktree__found-count').textContent();
  проверить(/По запросу «анна» найдено: \d+/.test(найдено), `ответ поиска на месте веток («${найдено}»)`);
  проверить(await p.locator('[data-checktree-set] > [data-checktree]').isHidden(), 'ветки спрятаны');
  проверить(запросы.some((u) => u.includes('/образец-дерева/поиск?найти=анна')), 'поиск спросил сервер ?найти=анна');
  await p.locator('.checktree__found-actions button').first().click();
  const всеВключены = await p.$$eval('[data-checktree-found] [data-checktree-box]', (all) => all.every((b) => b.checked));
  проверить(всеВключены, '«Включить найденные» отметило совпадения на месте');
  ряд = await плашки(p);
  проверить(ряд.length > 2, `найденные стали правками (${ряд.length} плашек)`);
  проверить(await безПерезагрузки(p), 'поиск и «Включить найденные» без перезагрузки');
  await p.fill('[data-checktree-search] input', '');
  await p.waitForTimeout(200);
  проверить(await p.locator('[data-checktree-set] > [data-checktree]').isVisible()
    && await p.locator('[data-checktree-set] > [data-checktree-found]').count() === 0, 'пустое поле вернуло ветки');

  await снимок(p, 'правки-1280-светлая');

  // отправка отдаёт только правки
  await p.locator('form#vybor-uchastnikov button[type=submit]', { hasText: 'Сохранить выбор' }).click();
  await p.waitForSelector('.toast');
  const пары = new URLSearchParams(тело);
  const имена = [...new Set([...пары.keys()])];
  проверить(пары.get('правки') === '1', 'ушло правки=1');
  проверить(пары.getAll('снять').includes('alpha-001'), 'ушло снять=alpha-001');
  проверить(пары.getAll('включить').length > 0 && !пары.getAll('включить').includes('alpha-003'), 'ушли включённые найденные, снятая правка — нет');
  проверить(пары.getAll('режим').includes('beta:все'), 'ушло режим=beta:все');
  проверить(!имена.some((и) => /^[a-z]+-\d{3}$/.test(и) || и.startsWith('режим:')),
    `галки и радиокнопки режимов не ушли (поля: ${имена.join(', ')})`);
  const тост = await p.locator('.toast').first().textContent();
  проверить(тост.includes('правки:') && тост.includes('beta — все'), `сервер разобрал правки («${тост.trim().slice(0, 90)}…»)`);
  проверить(await безПерезагрузки(p), 'отправка тихая');
  проверить((await плашки(p)).length === 0, 'после сохранения правок нет');
  await ctx.close();
}

// «Частично» пересчитывает скрипт: образец «Три состояния ветки» на странице документации.
async function частично(b) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  const p = await ctx.newPage();
  await p.goto(СТРАНИЦА, { waitUntil: 'networkidle' });
  // образец «Три состояния»: первое дерево с веткой край_1
  const дерево = p.locator('ul[data-checktree]:has([name="край_1"])').first();
  const состояние = (имя) => дерево.evaluate((root, имя) => {
    const b = root.querySelector(`[name="${имя}"]`);
    return b ? (b.indeterminate ? 'mixed' : b.checked ? 'on' : 'off') : 'нет';
  }, имя);
  const галка = (имя) => дерево.locator(`[name="${имя}"]`);
  проверить(await состояние('край_1') === 'mixed', 'частичная ветка — indeterminate после загрузки');
  await галка('город_2').check();
  проверить(await состояние('край_1') === 'on', 'все дети отмечены — ветка «включена»');
  await галка('край_1').click();
  проверить(await состояние('город_1') === 'off' && await состояние('город_2') === 'off',
    'щелчок по ветке снял её детей');
  await галка('город_1').check();
  проверить(await состояние('край_1') === 'mixed', 'один из двух — снова «частично»');
  await галка('край_1').click();
  проверить(await состояние('край_1') === 'on' && await состояние('город_2') === 'on',
    '«частично» щелчком — «включено», дети следом');
  await ctx.close();
}

// Переход без скрипта: щелчок и новый адрес. Ждём адрес, а не «load»: страницу, на которую
// перешли щелчком, headless-движок держит переходом видов и событие загрузки не досылает.
async function перейти(p, что, адрес) {
  await что.click({ noWaitAfter: true });
  await p.waitForURL((u) => адрес(decodeURIComponent(u.toString())), { waitUntil: 'commit' });
  await p.waitForSelector('[data-checktree-set], [data-checktree-page]', { state: 'attached' });
}

async function безСкрипта(b) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, javaScriptEnabled: false });
  let p = await ctx.newPage();
  await p.goto(ОБРАЗЕЦ, { waitUntil: 'networkidle' });
  проверить(await p.locator('[data-checktree-page="alpha"] > li').count() === 50, 'без скрипта: первые 50 в ветке');
  проверить(await p.locator('[data-checktree-edits]').isHidden(), 'без скрипта: ряд правок спрятан');
  const адрес = decodeURIComponent(await p.locator('[data-checktree-more="alpha"] a').getAttribute('href'));
  проверить(адрес === '/образец-дерева/ветка?ветка=alpha&страница=2', `без скрипта: «Показать ещё» — ссылка (${адрес})`);

  // обычная отправка галок
  let тело = '';
  p.on('request', (r) => { if (r.method() === 'POST') тело = r.postData() || ''; });
  await p.locator('[data-checktree-page=""] > li').first().locator('summary').click();
  await p.locator('[name="alpha-001"]').uncheck();
  await перейти(p, p.locator('button', { hasText: 'Сохранить выбор' }), (u) => u.includes('пришло='));
  const пары = new URLSearchParams(тело);
  проверить(!пары.has('правки') && пары.has('alpha-002') && !пары.has('alpha-001') && пары.get('режим:beta') === 'выбранные',
    'без скрипта ушли галки и радиокнопки режимов');
  const тост = await p.locator('.toast').first().textContent();
  проверить(тост.includes('галки: отмечено'), `сервер принял галки («${тост.trim().slice(0, 60)}»)`);

  // поиск без скрипта — отправка формы на адрес поиска. Каждый переход — со своей вкладки:
  // после перехода щелчком headless-движок держит переход видов (View Transitions между
  // документами) и не рисует страницу, а щелчку нужна нарисованная кнопка
  p = await ctx.newPage();
  await p.goto(ОБРАЗЕЦ, { waitUntil: 'networkidle' });
  await p.fill('[data-checktree-search] input', 'анна');
  await перейти(p, p.locator('[data-checktree-search] button'), (u) => u.endsWith('/образец-дерева/поиск'));
  проверить(decodeURIComponent(p.url()).endsWith('/образец-дерева/поиск'), 'без скрипта: «Найти» ушло на адрес поиска');
  проверить(await p.locator('[data-checktree-found] .checktree__found-count').textContent()
    .then((т) => т.startsWith('По запросу «анна» найдено')), 'без скрипта: страница ответа поиска');

  // ссылка «Показать ещё» ведёт на страницу ветки
  p = await ctx.newPage();
  await p.goto(ОБРАЗЕЦ, { waitUntil: 'networkidle' });
  await p.locator('[data-checktree-page=""] > li').first().locator('summary').click();
  await перейти(p, p.locator('[data-checktree-more="alpha"] a'), (u) => u.includes('страница=2'));
  проверить(await p.locator('[data-checktree-page="alpha"] > li').count() === 50
    && (await p.locator('.checktree__count').textContent()) === 'Показано 100 из 140',
    'без скрипта: страница ветки — следующие 50');
  await ctx.close();
}

async function снимок(p, имя) {
  await p.waitForTimeout(400); // галка сегмента доезжает своей анимацией
  await p.locator('[data-checktree-set]').first().screenshot({ path: path.join(OUT, `дерево-${имя}.png`) });
}

async function снимки(b) {
  for (const [тема, значение] of [['светлая', 'тема=светлая'], ['тёмная', 'тема=тёмная']]) {
    for (const ширина of [1280, 390]) {
      const ctx = await b.newContext({ viewport: { width: ширина, height: ширина > 500 ? 900 : 844 } });
      await ctx.addCookies([{ name: КУКА, value: encodeURIComponent(значение), url: B }]);
      const p = await ctx.newPage();
      const метка = `${ширина}-${тема}`;
      await p.goto(ОБРАЗЕЦ, { waitUntil: 'networkidle' });
      await p.locator('[data-checktree-page=""] > li').first().locator('summary').click();
      await p.locator('[name="alpha-001"]').uncheck();
      await p.locator('[data-checktree-modes="beta"] label', { hasText: 'Все' }).click();
      await снимок(p, `ветки-${метка}`);
      проверить(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
        `${метка}: без горизонтальной прокрутки`);
      await p.fill('[data-checktree-search] input', 'анна');
      await p.keyboard.press('Enter');
      await p.waitForSelector('[data-checktree-set] > [data-checktree-found]');
      await снимок(p, `поиск-${метка}`);
      await ctx.close();
    }
  }
}

(async () => {
  const b = await браузер();
  try {
    await соСкриптом(b);
    await частично(b);
    await безСкрипта(b);
    await снимки(b);
  } catch (err) {
    беды.push(String(err));
    console.log('БЕДА ' + err);
  }
  await b.close();
  console.log(беды.length ? `\nБЕД: ${беды.length}` : '\nвсё в порядке');
  process.exit(беды.length ? 1 : 0);
})();

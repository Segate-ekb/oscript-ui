// Слова и правки дев-сборки 0.13.0-dev.8 на образцах сайта документации: дерево галок для
// получателей (/образец-получателей — режим ветки «все, кроме», поиск значком в поле, ряд
// отмеченного вне показанного, сводка правок, правки без скрипта, плашка с крестиком тихой
// формой), сетка простых карточек на телефоне, длинное слово в окне подтверждения и хвосты
// аудита M3 (тень вложенной поверхности, прилипшая панель сохранения, рамка шагов в окне,
// фокус при открытии окна, подвал у низа окна, шеврон раскрывашки), адрес закрытия окна (со скриптом
// и без), шеврон панели, сегменты в окне, тумблер и флажок со справкой. Сайт документации
// должен быть запущен:
//
//   cd документация && oscript main.os --порт 3598
//   NODE_PATH=<каталог>/node_modules node tests/браузер/слова-дев-8.js [адрес] [каталог снимков]
//
// Код выхода 1, если что-то из обещанного не так. Снимки — в каталог снимков; в репозиторий
// их не кладут.

const { chromium } = require('playwright-core');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const B = process.argv[2] || process.env.BASE || 'http://localhost:3598';
const OUT = process.argv[3] || '/tmp/claude-501/снимки-слова-дев-8';
const ОБРАЗЕЦ = B + '/' + encodeURIComponent('образец-получателей');
const КУКА = 'oscript_ui_docs';
fs.mkdirSync(OUT, { recursive: true });

function адрес(страница) { return B + '/' + encodeURIComponent(страница); }
const адрес_ = адрес;

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

function образец(p, подпись) {
  return p.locator('figure.docs-sample', { has: p.locator('.docs-sample__title', { hasText: подпись }) }).first();
}

const плашки = (p) => p.locator('[data-checktree-edits] .chips-in__text').allTextContents();
const сводка = (p) => p.locator('[data-checktree-changes]').evaluate((el) => (el.hidden ? '' : el.textContent));
const ветка = (p, ключ) => p.locator(`[data-checktree-page="${ключ}"]`).first();
const режим = (p, ключ, значение) => p.locator(`[data-checktree-modes="${ключ}"] input[value="${значение}"]`).first();
const сегмент = (p, ключ, значение) => p.locator(`[data-checktree-modes="${ключ}"] label:has(input[value="${значение}"])`).first();

async function состояние(p, имя) {
  return p.evaluate((имя) => {
    const b = document.querySelector(`[data-checktree] [name="${имя}"]`);
    return b ? (b.indeterminate ? 'mixed' : b.checked ? 'on' : 'off') : 'нет';
  }, имя);
}

async function раскрыть(p, ключ) {
  await p.locator(`[data-checktree-page=""] > li:has([data-checktree-modes="${ключ}"]) > details > summary`).first().click();
}

// П1, П3, П5, П6 со скриптом
async function деревоСоСкриптом(b) {
  const ctx = await контекст(b, 1280);
  const p = await ctx.newPage();
  let тело = '';
  p.on('request', (r) => { if (r.method() === 'POST') тело = r.postData() || ''; });
  await p.goto(ОБРАЗЕЦ, { waitUntil: 'networkidle' });
  await p.evaluate(() => { window.__метка = 1; });

  // П1: ветка «все, кроме» — четыре сегмента, дети правятся
  проверить(await p.locator('[data-checktree-modes="alpha"] input').count() === 4, 'П1: у ветки четыре сегмента набора');
  проверить(await режим(p, 'alpha', 'кроме').isChecked(), 'П1: альфа — «все, кроме»');
  await раскрыть(p, 'alpha');
  проверить(!(await ветка(p, 'alpha').evaluate((el) => el.inert)), 'П1: дети ветки «кроме» не заперты (inert нет)');
  проверить(await состояние(p, 'alpha-003') === 'off', 'П1: исключённый ребёнок — своим состоянием с сервера');
  await p.locator('[data-checktree] [name="alpha-001"]').uncheck();
  let ряд = await плашки(p);
  проверить(ряд.length === 1 && ряд[0].startsWith('− '), `П1: исключение названо «− имя» (${ряд.join(' | ')})`);
  проверить(await сводка(p) === 'Изменений: 1 (+0 −1)', `П5: сводка правок («${await сводка(p)}»)`);

  // «все» → «кроме» оживляет детей отмеченными, «кроме» → «все» уносит их правки
  await раскрыть(p, 'zeta');
  проверить(await ветка(p, 'zeta').evaluate((el) => el.inert), 'П1: дети ветки «все» заперты');
  await сегмент(p, 'zeta', 'кроме').click();
  проверить(!(await ветка(p, 'zeta').evaluate((el) => el.inert)), 'П1: «все» → «кроме» — дети оживают');
  const всеОтмечены = await ветка(p, 'zeta').evaluate((el) => [...el.querySelectorAll('[data-checktree-box]')].every((x) => x.checked));
  проверить(всеОтмечены, 'П1: «все» → «кроме» — дети отмечены');
  await p.locator('[data-checktree] [name="zeta-002"]').uncheck();
  ряд = await плашки(p);
  проверить(ряд.some((т) => т.startsWith('Зета: ')) && ряд.filter((т) => т.startsWith('− ')).length === 2,
    `П1: правка режима и исключение в зете (${ряд.join(' | ')})`);
  await сегмент(p, 'zeta', 'все').click();
  ряд = await плашки(p);
  проверить(!ряд.some((т) => т.startsWith('Зета')) && ряд.length === 1 && await состояние(p, 'zeta-002') === 'on',
    `П1: «кроме» → «все» — исключения сняты вместе с правкой режима (${ряд.join(' | ')})`);

  // П3: отмеченное вне показанного
  const отмеченные = p.locator('[data-checktree-picked] [data-checktree-pick]');
  проверить(await отмеченные.count() === 3, 'П3: над деревом три отмеченных вне показанного');
  await отмеченные.first().locator('label.checktree__unpick').click();
  ряд = await плашки(p);
  проверить(ряд.some((т) => т.startsWith('− Гамма · ')), `П3: крестик — правка в общем ряду (${ряд.join(' | ')})`);
  проверить(await сводка(p) === 'Изменений: 2 (+0 −2)', `П5: сводка с отмеченным («${await сводка(p)}»)`);
  const зачёркнута = await отмеченные.first().locator('.chips-in__text').evaluate((el) => getComputedStyle(el).textDecorationLine);
  проверить(зачёркнута === 'line-through', 'П3: снятая плашка зачёркнута');
  await p.locator('[data-checktree-edits] .checktree__edit', { hasText: 'Гамма' }).locator('[data-checktree-undo]').click();
  проверить(!(await отмеченные.first().locator('input').isChecked()), 'П3: снятая в ряду правка возвращает плашку');
  await отмеченные.first().locator('label.checktree__unpick').click();
  await снимок(p.locator('[data-checktree-set]').first(), 'получатели-правки-1280');

  // П6: поиск значком
  const поиск = p.locator('[data-checktree-search] .search-bar');
  проверить(await поиск.count() === 1, 'П6: поиск дерева — строка поиска со значком');
  const значок = поиск.locator('button');
  проверить(await значок.getAttribute('aria-label') === 'Найти' && (await значок.innerText()).trim() === '',
    'П6: значок без подписи, с именем «Найти»');
  const внутри = await поиск.evaluate((el) => {
    const f = el.querySelector('.field__control').getBoundingClientRect();
    const k = el.querySelector('button').getBoundingClientRect();
    return k.left >= f.left && k.right <= f.right + 1 && k.top >= f.top - 1 && k.bottom <= f.bottom + 1;
  });
  проверить(внутри, 'П6: значок внутри рамки поля');
  await p.fill('[data-checktree-search] input', 'анна');
  await p.keyboard.press('Enter');
  await p.waitForSelector('[data-checktree-set] > [data-checktree-found]');
  проверить(true, 'П6: Enter взял ответ поиска на место веток');
  await p.fill('[data-checktree-search] input', '');
  await p.waitForTimeout(200);

  // отправка: только правки, поле показанного не уходит
  await p.locator('form#vybor-poluchateley button[type=submit]', { hasText: 'Сохранить получателей' }).click();
  await p.waitForSelector('.toast');
  const пары = new URLSearchParams(тело);
  проверить(пары.get('правки') === '1' && пары.getAll('снять').includes('alpha-001') && пары.getAll('снять').includes('gamma-052'),
    `ушли правки: снять alpha-001 и gamma-052 (${[...пары.keys()].join(', ')})`);
  проверить(!пары.has('показано'), 'со скриптом поле показанного не уходит');
  проверить(await p.evaluate(() => window.__метка === 1), 'отправка тихая');
  await ctx.close();
}

// П1, П3, П6 без скрипта
async function деревоБезСкрипта(b) {
  const ctx = await контекст(b, 1280, false);
  let p = await ctx.newPage();
  let тело = '';
  p.on('request', (r) => { if (r.method() === 'POST') тело = r.postData() || ''; });
  await p.goto(ОБРАЗЕЦ, { waitUntil: 'networkidle' });
  const заперт = (ключ) => p.locator(`[data-checktree-page="${ключ}"]`).first().evaluate((el) => getComputedStyle(el).pointerEvents);
  проверить(await заперт('alpha') !== 'none' && await заперт('zeta') === 'none', 'без скрипта: «кроме» правится, «все» заперт листом');
  проверить(await p.locator('[data-checktree-shown]').count() === 1, 'без скрипта: поле показанного напечатано');
  проверить(await p.locator('[data-checktree-changes]').isHidden(), 'без скрипта: сводки правок не видно');
  await раскрыть(p, 'alpha');
  await p.locator('[data-checktree] [name="alpha-001"]').uncheck();
  await p.locator('[data-checktree-pick] label.checktree__unpick').first().click();
  const зачёркнута = await p.locator('[data-checktree-pick] .chips-in__text').first().evaluate((el) => getComputedStyle(el).textDecorationLine);
  проверить(зачёркнута === 'line-through', 'без скрипта: крестик отмеченного зачёркивает плашку');
  await снимок(p.locator('[data-checktree-set]').first(), 'получатели-без-скрипта-1280');
  await p.locator('button', { hasText: 'Сохранить получателей' }).click({ noWaitAfter: true });
  await p.waitForURL((u) => decodeURIComponent(u.toString()).includes('пришло='), { waitUntil: 'commit' });
  await p.waitForSelector('.toast', { state: 'attached' });
  const тост = await p.locator('.toast').first().textContent();
  проверить(тост.includes('правки без скрипта') && тост.includes('alpha-001') && тост.includes('gamma-052') && !тост.includes('alpha-002'),
    `без скрипта: сервер получил правки против показанного («${тост.trim().slice(0, 120)}»)`);

  // поиск значком без скрипта — отправка формы на адрес поиска
  p = await ctx.newPage();
  await p.goto(ОБРАЗЕЦ, { waitUntil: 'networkidle' });
  await p.fill('[data-checktree-search] input', 'анна');
  await p.locator('[data-checktree-search] button').click({ noWaitAfter: true });
  await p.waitForURL((u) => decodeURIComponent(u.toString()).endsWith('/образец-получателей/поиск'), { waitUntil: 'commit' });
  await p.waitForSelector('[data-checktree-found]', { state: 'attached' });
  проверить(true, 'без скрипта: значок поиска ушёл на адрес поиска');
  await ctx.close();
}

// П4: плашка с крестиком тихой формой
async function плашкаСКрестиком(b) {
  for (const скрипт of [true, false]) {
    const ctx = await контекст(b, 390, скрипт);
    const p = await ctx.newPage();
    await p.goto(ОБРАЗЕЦ, { waitUntil: 'networkidle' });
    const ряд = p.locator('.tag-row:has(form.tag-form)').first();
    const формы = await ряд.locator(':scope > form.tag-form').count();
    // форма — строчный блок вокруг плашки: в ряду она не выше самой плашки и не шире ряда
    const вРяд = await ряд.evaluate((el) => getComputedStyle(el).display === 'flex' && [...el.querySelectorAll(':scope > form')].every((f) => {
      const ф = f.getBoundingClientRect(), п = f.querySelector('.tag').getBoundingClientRect();
      return Math.abs(ф.height - п.height) < 2 && ф.right <= el.getBoundingClientRect().right + 1;
    }));
    const метка = скрипт ? 'со скриптом' : 'без скрипта';
    проверить(формы === 2 && вРяд, `П4 ${метка}: две плашки-формы в ряду плашек — строчными блоками по размеру плашки`);
    if (скрипт) {
      await p.evaluate(() => { window.__метка = 1; });
      await снимок(ряд, 'плашки-с-крестиком-390');
    }
    const крестик = ряд.locator('form.tag-form').first().locator('button[type=submit]');
    проверить((await крестик.getAttribute('aria-label')) === 'Снять «− Вера Шевчук»', `П4 ${метка}: имя крестика из словаря`);
    await крестик.click({ noWaitAfter: true });
    if (скрипт) {
      await p.waitForSelector('.toast');
    } else {
      await p.waitForURL((u) => decodeURIComponent(u.toString()).includes('пришло='), { waitUntil: 'commit' });
      await p.waitForSelector('.toast', { state: 'attached' });
    }
    const тост = await p.locator('.toast').first().textContent();
    проверить(тост.includes('правка плашкой: включить alpha-003'), `П4 ${метка}: форма крестика ушла («${тост.trim()}»)`);
    if (скрипт) {
      проверить(await p.evaluate(() => window.__метка === 1), 'П4: без перезагрузки');
    }
    await ctx.close();
  }
}

// П-пул-1: длинный адрес в окне подтверждения на 390
async function длинноеСлово(b) {
  for (const скрипт of [true, false]) {
    const ctx = await контекст(b, 390, скрипт, 'тёмная', 844);
    const p = await ctx.newPage();
    await p.goto(адрес('подтверждение'), { waitUntil: 'networkidle' });
    if (скрипт) {
      const f = образец(p, 'Длинный адрес');
      await f.scrollIntoViewIfNeeded();
      await f.locator('button', { hasText: 'Удалить зеркало' }).first().click();
    } else {
      await p.evaluate(() => document.getElementById('udalit-zerkalo').setAttribute('open', ''));
    }
    await p.waitForTimeout(500);
    const з = await p.evaluate(() => {
      const d = document.getElementById('udalit-zerkalo');
      const lead = d.querySelector('.modal__lead');
      const echo = d.querySelector('.modal__echo .field__label');
      return { вбок: document.documentElement.scrollWidth > innerWidth, справа: d.getBoundingClientRect().right,
        лид: lead.scrollWidth <= lead.clientWidth + 1, эхо: echo.scrollWidth <= echo.clientWidth + 1 && echo.textContent.includes('/oscript/') };
    });
    const метка = скрипт ? 'со скриптом' : 'без скрипта';
    проверить(!з.вбок && з.справа <= 390, `П-пул-1 ${метка}: окно не шире экрана`);
    проверить(з.лид, `П-пул-1 ${метка}: адрес из 64 знаков в лиде переносится, не обрезан`);
    проверить(з.эхо, `П-пул-1 ${метка}: эхо имени видно целиком`);
    await p.screenshot({ path: path.join(OUT, `подтверждение-длинный-адрес-390-${скрипт ? 'скрипт' : 'без-скрипта'}.png`) });
    await ctx.close();
  }
}

// Сетка простых карточек на телефоне (наблюдение к ui.4) и тень вложенной поверхности (№11)
async function карточки(b) {
  for (const [ширина, тема] of [[390, 'тёмная'], [390, 'светлая'], [1280, 'светлая']]) {
    const ctx = await контекст(b, ширина, true, тема);
    const p = await ctx.newPage();
    await p.goto(адрес('карточка'), { waitUntil: 'networkidle' });
    const f = образец(p, 'Группы проектов в карточке');
    await f.scrollIntoViewIfNeeded();
    const з = await f.evaluate((el) => {
      const внешняя = el.querySelector('.docs-sample__stage > .card, .card');
      const внутр = внешняя.querySelector('.grid__cell > .card');
      const s = getComputedStyle(внешняя), i = getComputedStyle(внутр);
      return { теньВнешней: s.boxShadow, фонВнешней: s.backgroundColor, тень: i.boxShadow, фон: i.backgroundColor,
        ширина: Math.round(внутр.getBoundingClientRect().width), черта: i.borderTopWidth };
    });
    if (ширина === 390) {
      проверить(з.теньВнешней === 'none' && з.фонВнешней === 'rgba(0, 0, 0, 0)', `карточки 390 ${тема}: внешняя плоская`);
      проверить(з.тень !== 'none' && з.фон !== 'rgba(0, 0, 0, 0)' && з.черта === '0px', `карточки 390 ${тема}: карточка сетки — карточка (${з.ширина} px)`);
    } else {
      проверить(!/rgba\(0, 0, 0, 0\.3\)/.test(з.тень), `№11 1280: у вложенной карточки нет своей тени (${з.тень.slice(0, 60)})`);
    }
    await снимок(f, `карточки-сеткой-${ширина}-${тема}`);
    await ctx.close();
  }
}

// Хвосты аудита: прилипшая панель, рамка шагов в окне, фокус окна, подвал, шеврон
async function хвосты(b) {
  const ctx = await контекст(b, 1280, true, 'светлая', 700);
  let p = await ctx.newPage();

  await p.goto(адрес('панель-сохранения'), { waitUntil: 'networkidle' });
  const панель = await p.evaluate(async () => {
    const образец = document.querySelector('[data-savebar]');
    const ровно = getComputedStyle(образец).boxShadow;
    const bar = образец.cloneNode(true);
    const box = document.createElement('form');
    box.className = 'card';
    const spacer = document.createElement('div');
    spacer.style.height = '2000px';
    box.append(spacer, bar);
    document.querySelector('main').prepend(box);
    document.dispatchEvent(new CustomEvent('oscript-ui:update'));
    window.scrollTo(0, box.getBoundingClientRect().top + scrollY + 300);
    await new Promise((r) => setTimeout(r, 400));
    const липнет = [bar.hasAttribute('data-stuck'), getComputedStyle(bar).boxShadow];
    window.scrollTo(0, box.getBoundingClientRect().bottom + scrollY - 400);
    await new Promise((r) => setTimeout(r, 400));
    return { ровно, липнет, наМесте: [bar.hasAttribute('data-stuck'), getComputedStyle(bar).boxShadow] };
  });
  проверить(панель.ровно === 'none', '№12: панель в конце формы — без тени');
  проверить(панель.липнет[0] && панель.липнет[1] !== 'none', '№12: прилипшая к низу экрана — с тенью');
  проверить(!панель.наМесте[0] && панель.наМесте[1] === 'none', '№12: вернулась на место — тень ушла');

  await p.goto(адрес('шаги'), { waitUntil: 'networkidle' });
  const мастер = образец(p, 'Мастер в окне');
  await мастер.scrollIntoViewIfNeeded();
  await мастер.locator('button', { hasText: 'Новый проект' }).first().click();
  await p.waitForTimeout(500);
  const шаг = await p.evaluate(() => {
    const панель = document.querySelector('#master-v-okne .steps__panel:not([hidden])');
    const s = getComputedStyle(панель);
    return { рамка: s.borderTopWidth, фон: s.backgroundColor, фокус: document.activeElement && document.activeElement.name };
  });
  проверить(шаг.рамка === '0px' && шаг.фон === 'rgba(0, 0, 0, 0)', '№13: у шага в окне нет рамки и своей заливки');
  проверить(шаг.фокус === 'name', `№18: окно с шагами открылось с фокусом на поле (${шаг.фокус})`);
  await p.screenshot({ path: path.join(OUT, 'шаги-в-окне-1280.png') });

  await p.goto(адрес('окно'), { waitUntil: 'networkidle' });
  const окно = образец(p, 'Кнопка и окно');
  await окно.scrollIntoViewIfNeeded();
  await окно.locator('button', { hasText: 'Новый проект' }).first().focus();
  await p.keyboard.press('Enter');
  await p.waitForTimeout(500);
  const фокус = await p.evaluate(() => [document.activeElement.name, document.activeElement.getAttribute('aria-label')]);
  проверить(фокус[0] === 'name' && фокус[1] !== 'Закрыть окно', `№18: фокус на первом поле, а не на крестике (${фокус.join(' / ')})`);

  p = await ctx.newPage();
  await p.goto(B + '/' + encodeURIComponent('образец-дерева') + '/' + encodeURIComponent('ветка') + '?' + encodeURIComponent('ветка') + '=нет', { waitUntil: 'networkidle' });
  const подвал = await p.evaluate(() => [Math.round(document.querySelector('footer').getBoundingClientRect().bottom), innerHeight]);
  проверить(подвал[0] === подвал[1], `№39: на короткой странице подвал у низа окна (${подвал.join(' из ')})`);

  await p.goto(адрес('раскладка'), { waitUntil: 'networkidle' });
  const маркер = await образец(p, 'Простая раскрывашка').evaluate((el) => {
    const s = el.querySelector('details > summary');
    const до = getComputedStyle(s, '::before');
    return { список: getComputedStyle(s).listStyleType, справа: до.borderRightWidth, сверху: до.borderTopWidth, поворот: до.transform };
  });
  проверить(маркер.список === 'none' && маркер.справа !== '0px' && маркер.сверху === '0px' && маркер.поворот !== 'none',
    `№34: у простой раскрывашки шеврон, а не системный треугольник (${маркер.поворот})`);
  await ctx.close();
}

// П1–П3, П5 трека ui-хвост-единообразие: адрес закрытия окна, шеврон панели, сегменты в окне
async function закрытиеОкна(b) {
  const ОКНА = B + '/' + encodeURIComponent('образец-окон');
  // без скрипта: подтверждение по адресу, «Отмена» — переход на раздел без окна
  let ctx = await контекст(b, 1280, false);
  let p = await ctx.newPage();
  await p.goto(ОКНА, { waitUntil: 'networkidle' });
  const проект = await p.locator('input[name="project"]').first().getAttribute('value');
  await p.goto(ОКНА + '/' + encodeURIComponent('удалить') + '?project=' + encodeURIComponent(проект), { waitUntil: 'networkidle' });
  проверить(await p.locator('dialog[open]').count() === 1, 'АдресЗакрытия без скрипта: подтверждение открыто по адресу');
  await снимок(p.locator('dialog[open]'), 'подтверждение-отмена-ссылкой-без-скрипта');
  await Promise.all([p.waitForURL((u) => !decodeURIComponent(u.toString()).includes('удалить'), { waitUntil: 'commit' }),
    p.locator('dialog[open] .modal__actions a', { hasText: 'Отмена' }).click({ noWaitAfter: true })]);
  await p.waitForLoadState('domcontentloaded');
  const адрес = decodeURIComponent(p.url());
  проверить(адрес.endsWith('/образец-окон') && await p.locator('dialog[open]').count() === 0,
    `АдресЗакрытия без скрипта: «Отмена» привела на раздел без окна (${адрес})`);
  await ctx.close();

  // со скриптом: окно по адресу закрывается «Отменой» на месте, без перехода
  ctx = await контекст(b, 1280, true);
  p = await ctx.newPage();
  await p.goto(ОКНА + '?' + encodeURIComponent('окно') + '=' + encodeURIComponent('правка') + '&project=' + encodeURIComponent(проект), { waitUntil: 'networkidle' });
  await p.evaluate(() => { window.__метка = 1; });
  проверить(await p.evaluate(() => document.getElementById('pravka').matches(':modal')), 'АдресЗакрытия со скриптом: окно правки поднято модальным');
  await p.locator('#pravka .modal__actions a', { hasText: 'Отмена' }).click();
  await p.waitForTimeout(300);
  проверить(!(await p.evaluate(() => document.getElementById('pravka').open)) && await p.evaluate(() => window.__метка === 1),
    'АдресЗакрытия со скриптом: «Отмена» закрыла окно на месте, без перезагрузки');
  await ctx.close();

  // шеврон панели
  ctx = await контекст(b, 1280, true);
  p = await ctx.newPage();
  await p.goto(адрес_('раскладка'), { waitUntil: 'networkidle' });
  const шеврон = await образец(p, 'Раскрывашка, открытая сразу').evaluate((el) => {
    const s = el.querySelector('.panel__head');
    const после = getComputedStyle(s, '::after');
    return { есть: после.content === '""', справа: после.borderRightWidth !== '0px', поворот: после.transform };
  });
  проверить(шеврон.есть && шеврон.справа && шеврон.поворот !== 'none', `П3: у панели шеврон справа (${шеврон.поворот})`);
  await ctx.close();

  // сегменты в окне на 390 и 1280: подписи целиком, пилюля не шире окна
  for (const ширина of [390, 1280]) {
    ctx = await контекст(b, ширина, true);
    p = await ctx.newPage();
    await p.goto(адрес_('сегменты'), { waitUntil: 'networkidle' });
    const ф = образец(p, 'Пять сегментов в окне');
    await ф.scrollIntoViewIfNeeded();
    await ф.locator('button', { hasText: 'Оформление' }).first().click();
    await p.waitForTimeout(400);
    const з = await p.evaluate(() => {
      const d = document.getElementById('oformlenie-metki');
      const box = d.querySelector('.modal__box').getBoundingClientRect();
      const g = d.querySelector('.segments').getBoundingClientRect();
      return { обрезаны: [...d.querySelectorAll('.segments__text')].filter((t) => t.scrollWidth > t.clientWidth + 1).length,
        влезла: g.right <= box.right + 0.5 && g.left >= box.left - 0.5 };
    });
    проверить(з.обрезаны === 0 && з.влезла, `П5 ${ширина}: в окне подписи сегментов целиком, пилюля не шире окна`);
    await p.screenshot({ path: path.join(OUT, `сегменты-в-окне-${ширина}.png`) });
    await ctx.close();
  }
}

// Слово владельца к ui.4: тумблер и флажок со справкой — щелчок по дорожке и флажку переключает,
// а не открывает справку; щелчок по «?» открывает
async function справка(b) {
  const ctx = await контекст(b, 1280, true);
  const p = await ctx.newPage();
  for (const [страница, строка, элемент, что] of [
    ['тумблер', '.field-help:has(> .toggle)', '.toggle__track', 'тумблер'],
    ['подсказка', '.field-help:has(> .field--check)', 'input[type=checkbox]', 'флажок']]) {
    await p.goto(адрес(страница), { waitUntil: 'networkidle' });
    const ряд = p.locator(строка).first();
    await ряд.scrollIntoViewIfNeeded();
    const галка = ряд.locator('input[type=checkbox]').first();
    const было = await галка.isChecked();
    const открыта = () => ряд.evaluate((el) => {
      const id = el.querySelector('.help').getAttribute('popovertarget');
      const pop = id && document.getElementById(id);
      return !!(pop && pop.matches(':popover-open'));
    });
    await ряд.locator(элемент).first().click({ force: что === 'флажок' });
    проверить(await галка.isChecked() !== было && !(await открыта()), `справка: щелчок по ${что === 'тумблер' ? 'дорожке тумблера' : 'флажку'} переключает, справка закрыта`);
    const подпись = await ряд.evaluate((el) => {
      const t = el.querySelector('.toggle__label, .field__label, label span');
      const r = t.getBoundingClientRect();
      const над = document.elementFromPoint(r.left + 4, r.top + r.height / 2);
      return !над.closest('.help');
    });
    проверить(подпись, `справка: над подписью «${что}» — не значок справки`);
    await ряд.locator('.help').click();
    await p.waitForTimeout(200);
    проверить(await открыта(), `справка: щелчок по «?» у «${что}» открывает поповер`);
    await p.keyboard.press('Escape');
  }
  await ctx.close();
}

async function снимок(локатор, имя) {
  await локатор.page().waitForTimeout(300);
  await локатор.screenshot({ path: path.join(OUT, `${имя}.png`) });
}

(async () => {
  const b = await браузер();
  for (const [имя, шаг] of [['дерево со скриптом', деревоСоСкриптом], ['дерево без скрипта', деревоБезСкрипта],
    ['плашка с крестиком', плашкаСКрестиком], ['длинное слово', длинноеСлово], ['карточки', карточки], ['хвосты', хвосты],
    ['закрытие окна', закрытиеОкна], ['справка', справка]]) {
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

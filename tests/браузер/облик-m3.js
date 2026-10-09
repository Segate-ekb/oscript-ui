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

// Окно образца «Кнопка и окно», перенесённое в тело карточки после абзаца: так его печатает
// приложение в секции или карточке, где правило ритма даёт не первому ребёнку margin-top.
async function окноВКарточке(p, ид) {
  await p.evaluate((ид) => {
    const окно = document.getElementById(ид);
    const карточка = document.createElement('div');
    карточка.className = 'card';
    карточка.innerHTML = '<div class="card__body"><p>Тело карточки перед окном.</p></div>';
    document.querySelector('main').prepend(карточка);
    карточка.firstChild.appendChild(окно);
    окно.showModal();
  }, ид);
  await p.waitForTimeout(500);
  return p.evaluate((ид) => {
    const r = document.getElementById(ид).getBoundingClientRect();
    return { верх: Math.round(r.top), низ: Math.round(innerHeight - r.bottom), лево: Math.round(r.left),
      право: Math.round(innerWidth - r.right), ширина: Math.round(r.width), высота: Math.round(r.height) };
  }, ид);
}

// S2: окно в теле карточки — по центру экрана, а не у верхнего края.
async function окноПоЦентру(b) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  const p = await ctx.newPage();
  await p.goto(адрес('окно'), { waitUntil: 'networkidle' });
  const з = await окноВКарточке(p, 'novyi-proekt-obrazec');
  проверить(Math.abs(з.верх - з.низ) <= 2, `S2 1280: окно в карточке по центру по высоте (сверху ${з.верх}, снизу ${з.низ})`);
  проверить(Math.abs(з.лево - з.право) <= 2, `S2 1280: окно по центру по ширине (${з.лево} / ${з.право})`);
  await p.screenshot({ path: path.join(OUT, 'окно-в-карточке-1280.png') });
  await ctx.close();
}

// Открывает окно страницы по идентификатору и меряет его относительно экрана.
async function открытьИЗамерить(p, ид) {
  await p.evaluate((ид) => document.getElementById(ид).showModal(), ид);
  await p.waitForTimeout(500);
  return p.evaluate((ид) => {
    const d = document.getElementById(ид);
    const r = d.getBoundingClientRect();
    const д = d.querySelector('.modal__actions, .steps__nav');
    const тело = d.querySelector('.modal__body');
    return { ш: Math.round(r.width), в: Math.round(r.height), верх: Math.round(r.top), низ: Math.round(innerHeight - r.bottom),
      лево: Math.round(r.left), право: Math.round(innerWidth - r.right), шв: innerWidth, вв: innerHeight,
      действияНиз: д ? Math.round(innerHeight - д.getBoundingClientRect().bottom) : null,
      действияПодТелом: д && тело ? д.getBoundingClientRect().top >= тело.getBoundingClientRect().bottom - 0.5 : null };
  }, ид);
}

// S5: на 390 короткое окно — базовое, по центру и в экран без полей 16 px; окно ВоВесьЭкран и
// окно с шагами — лист во весь экран; на 1280 базовое 560, широкое 640.
async function окнаНаТелефоне(b) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  const p = await ctx.newPage();
  await p.goto(адрес('окно'), { waitUntil: 'networkidle' });
  let з = await открытьИЗамерить(p, 'pereimenovat-telefon');
  проверить(з.ш === з.шв - 32 && Math.abs(з.лево - з.право) <= 1, `S5 390: короткое окно — базовое, ширина ${з.ш} = экран − 32`);
  проверить(Math.abs(з.верх - з.низ) <= 2 && з.в < з.вв / 2, `S5 390: короткое окно по центру, не лист (высота ${з.в})`);
  проверить(з.действияПодТелом, 'S5 390: действия под телом');
  await p.screenshot({ path: path.join(OUT, 'окно-короткое-390.png') });
  await p.keyboard.press('Escape');
  await p.waitForTimeout(400);
  з = await открытьИЗамерить(p, 'istochnik-telefon');
  проверить(з.ш === з.шв && з.в === з.вв, `S5 390: ВоВесьЭкран — лист во весь экран (${з.ш}×${з.в})`);
  проверить(Math.abs(з.действияНиз) <= 1, `S5 390: у листа действия прилипли к низу (${з.действияНиз})`);
  await p.screenshot({ path: path.join(OUT, 'окно-во-весь-экран-390.png') });
  await p.keyboard.press('Escape');
  await p.goto(адрес('шаги'), { waitUntil: 'networkidle' });
  з = await открытьИЗамерить(p, 'master-v-okne');
  проверить(з.ш === з.шв && з.в === з.вв, `S5 390: окно с шагами — лист во весь экран (${з.ш}×${з.в})`);
  await p.setViewportSize({ width: 1280, height: 900 });
  await p.waitForTimeout(300);
  з = await p.evaluate(() => Math.round(document.getElementById('master-v-okne').getBoundingClientRect().width));
  проверить(з === 640, `S5 1280: широкое окно — 640 (${з})`);
  await p.keyboard.press('Escape');
  await p.goto(адрес('окно'), { waitUntil: 'networkidle' });
  з = await открытьИЗамерить(p, 'pereimenovat-telefon');
  проверить(з.ш === 560, `S5 1280: базовое окно — 560 (${з.ш})`);
  await ctx.close();
}

// Образец документации кладётся страницей приложения: его разметка — единственное содержимое
// main.wrap, без рамки образца, — так меряется то, что увидит человек в приложении.
async function образецСтраницей(p, страница, подпись) {
  await p.goto(адрес(страница), { waitUntil: 'networkidle' });
  await p.evaluate((подпись) => {
    const fig = [...document.querySelectorAll('figure.docs-sample')]
      .find((f) => f.querySelector('.docs-sample__title').textContent.startsWith(подпись));
    const main = document.querySelector('main');
    main.className = 'wrap';
    main.innerHTML = fig.querySelector('.docs-sample__preview').innerHTML;
  }, подпись);
}

// S6: на 390 вложенная карточка объекта и таблица внутри карточки — без тени и кольца, а их
// содержимому достаётся не меньше 326 px (было около 270); на 1280 вложенная карточка — с кольцом.
async function карточкаВКарточке(b) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  const p = await ctx.newPage();
  await образецСтраницей(p, 'карточка', 'Проекты в карточке');
  const з = await p.evaluate(() => {
    const к = document.querySelector('.card .objcard');
    const ст = getComputedStyle(к);
    const таблица = document.querySelector('.card .table-scroll');
    const содержимое = к.getBoundingClientRect().width - parseFloat(ст.paddingLeft) - parseFloat(ст.paddingRight);
    return { содержимое: Math.round(содержимое), тень: ст.boxShadow, фон: ст.backgroundColor,
      таблица: Math.round(таблица.clientWidth), рамка: getComputedStyle(таблица).borderTopWidth,
      вбок: document.documentElement.scrollWidth > innerWidth };
  });
  проверить(з.содержимое >= 326, `S6 390: содержимое вложенной карточки ${з.содержимое} ≥ 326`);
  проверить(з.тень === 'none' && з.фон === 'rgba(0, 0, 0, 0)', `S6 390: вложенная карточка без тени, кольца и заливки (${з.тень})`);
  проверить(з.таблица >= 326 && з.рамка === '0px', `S6 390: таблица в карточке без обводки, ширина ${з.таблица}`);
  проверить(!з.вбок, 'S6 390: страница без прокрутки вбок');
  await p.screenshot({ path: path.join(OUT, 'карточка-в-карточке-390.png'), fullPage: true });
  await p.setViewportSize({ width: 1280, height: 900 });
  const широко = await p.evaluate(() => getComputedStyle(document.querySelector('.card .objcard')).boxShadow);
  проверить(широко !== 'none', 'S6 1280: на широком экране вложенная карточка объекта — с кольцом');
  await ctx.close();
}

// S4: ссылка в тексте подчёркнута в обеих темах; ссылка навигации, ячейки таблицы и имя
// карточки объекта — нет.
async function ссылкиВТексте(b) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  const p = await ctx.newPage();
  await p.goto(адрес('окно'), { waitUntil: 'networkidle' });
  const з = await p.evaluate(() => {
    const линия = (el) => el ? getComputedStyle(el).textDecorationLine : 'нет элемента';
    const таблица = document.createElement('table');
    таблица.innerHTML = '<tbody><tr><td><a href="#x">ячейка</a></td></tr></tbody>';
    document.querySelector('main').appendChild(таблица);
    return {
      абзац: линия(document.querySelector('main p a:not([class])')),
      пункт: линия(document.querySelector('main li a:not([class])')),
      навигация: линия(document.querySelector('a[class*="tree__link"], nav a[class]')),
      ячейка: линия(таблица.querySelector('a')),
      оглавление: линия(document.querySelector('.docs__toc li > a')),
    };
  });
  проверить(з.абзац === 'underline', `S4: ссылка в абзаце подчёркнута (${з.абзац})`);
  проверить(з.пункт === 'underline', `S4: ссылка в пункте списка подчёркнута (${з.пункт})`);
  проверить(з.навигация === 'none', `S4: ссылка навигации без подчёркивания (${з.навигация})`);
  проверить(з.оглавление === 'none', `S4: пункт оглавления страницы без подчёркивания (${з.оглавление})`);
  проверить(з.ячейка === 'none', `S4: ссылка в ячейке таблицы без подчёркивания (${з.ячейка})`);
  await p.goto(адрес('раскладка'), { waitUntil: 'networkidle' });
  const имя = await образец(p, 'Карточка объекта').locator('.objcard__name a').first()
    .evaluate((a) => getComputedStyle(a).textDecorationLine);
  проверить(имя === 'none', `S4: имя карточки объекта без подчёркивания (${имя})`);
  await ctx.close();
}

// Область касания элемента: точки в 23 px от центра по четырём сторонам попадают в него
// (или в его потомка). Видимый размер — коробка элемента.
async function областьКасания(локатор) {
  return локатор.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const попал = (x, y) => { const t = document.elementFromPoint(x, y); return !!t && (t === el || el.contains(t)); };
    let край = 0;
    for (let d = 1; d <= 30; d++) {
      if (попал(cx - d, cy) && попал(cx + d, cy) && попал(cx, cy - d) && попал(cx, cy + d)) край = d; else break;
    }
    return { видно: Math.round(Math.min(r.width, r.height)), касание: край * 2 };
  });
}

// S8: на касании (pointer: coarse) у кнопки-значка, малой кнопки-значка, крестика плашки
// списка, кружка акцента, «?» подсказки и ссылки в ячейке таблицы область касания не меньше
// 48, а видимый размер прежний; мышью (pointer: fine) — область кнопки-значка прежняя.
async function целиКасания(b) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const p = await ctx.newPage();
  проверить(await p.evaluate(() => matchMedia('(pointer: coarse)').matches), 'S8: эмуляция касания — pointer: coarse');
  await p.goto(адрес('кнопка'), { waitUntil: 'networkidle' });
  for (const [что, селектор] of [['кнопка-значок', '.docs-sample__preview .button--icon:not(.button--sm)'],
    ['малая кнопка-значок', '.docs-sample__preview .button--icon.button--sm']]) {
    const л = p.locator(селектор).first();
    await л.scrollIntoViewIfNeeded();
    const з = await областьКасания(л);
    проверить(з.касание >= 46, `S8 касание: ${что} — видно ${з.видно}, область ${з.касание + 2}`);
  }
  await p.goto(адрес('поле'), { waitUntil: 'networkidle' });
  const цели = [
    ['крестик плашки списка', 'main .chips-in__remove:not([disabled])'],
    ['кружок акцента', 'main .swatches__item'],
    ['«?» подсказки', 'main .help'],
  ];
  for (const [что, селектор] of цели) {
    const л = p.locator(селектор).first();
    if (!(await л.count())) { проверить(false, `S8: на странице «Поле» есть ${что} (${селектор})`); continue; }
    await л.scrollIntoViewIfNeeded();
    const з = await областьКасания(л);
    проверить(з.касание >= 46, `S8 касание: ${что} — видно ${з.видно}, область ${з.касание + 2}`);
  }
  const ячейка = await p.evaluate(() => {
    const т = document.createElement('table');
    т.innerHTML = '<tbody><tr><td><a href="#x">ключ</a></td><td>12 марта</td></tr></tbody>';
    document.querySelector('main').prepend(т);
    window.scrollTo(0, 0);
    return Math.round(т.querySelector('a').getBoundingClientRect().height);
  });
  проверить(ячейка >= 48, `S8 касание: ссылка в ячейке таблицы — высота ${ячейка}`);
  await ctx.close();

  const мышь = await b.newContext({ viewport: { width: 1280, height: 900 } });
  const м = await мышь.newPage();
  await м.goto(адрес('кнопка'), { waitUntil: 'networkidle' });
  const л = м.locator('.docs-sample__preview .button--icon.button--sm').first();
  await л.scrollIntoViewIfNeeded();
  const з = await областьКасания(л);
  проверить(з.касание <= з.видно, `S8 мышь: область малой кнопки-значка — её видимый размер (${з.касание + 2} при ${з.видно})`);
  await мышь.close();
}

// S10: рубрики колонки разделов (боковая навигация документации) и шторки — title-small
// обычным регистром, одного стиля с подписью группы шторки.
async function рубрики(b) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  const p = await ctx.newPage();
  await p.goto(адрес('дерево-разделов'), { waitUntil: 'networkidle' });
  const стиль = (sel) => p.evaluate((sel) => {
    const r = document.querySelector(sel);
    if (!r) return null;
    const ст = getComputedStyle(r);
    return `${ст.textTransform} ${ст.fontSize} ${ст.fontWeight}`;
  }, sel);
  const колонка = await стиль('.docs-sample__preview .tree__rubric');
  проверить(колонка === 'none 14px 500', `S10: рубрика колонки разделов — title-small обычным регистром (${колонка})`);
  const группа = await стиль('.docs__group');
  проверить(группа === 'none 14px 500', `S10: группа навигации документации — тем же стилем (${группа})`);
  await образец(p, 'Три рубрики').screenshot({ path: path.join(OUT, 'рубрики-1280.png') }).catch(() => {});
  await ctx.close();
}

// Пробел dev.4 п. 5: три сегмента с подписями в два слова на 390 — подписи целиком (перенос
// во вторую строку), без многоточия и без выхода за экран.
async function сегментыНаТелефоне(b) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  const p = await ctx.newPage();
  await p.goto(адрес('сегменты'), { waitUntil: 'networkidle' });
  const з = await образец(p, 'Три подписи').locator('.docs-sample__preview .segments').evaluate((г) => ({
    обрезано: [...г.querySelectorAll('.segments__text')].filter((т) => т.scrollWidth > т.clientWidth + 1).map((т) => т.textContent),
    строк: Math.max(...[...г.querySelectorAll('.segments__text')].map((т) =>
      Math.round(т.getBoundingClientRect().height / parseFloat(getComputedStyle(т).lineHeight)))),
    право: Math.round(г.getBoundingClientRect().right), экран: innerWidth,
  }));
  проверить(з.обрезано.length === 0, `сегменты 390: подписи целиком (обрезаны: ${з.обрезано.join(', ') || 'нет'})`);
  проверить(з.строк <= 2, `сегменты 390: не больше двух строк, слово не рвётся (${з.строк})`);
  проверить(з.право <= з.экран, `сегменты 390: группа в пределах экрана (${з.право})`);
  await образец(p, 'Три подписи').screenshot({ path: path.join(OUT, 'сегменты-390.png') });
  await ctx.close();
}

// Пробел dev.4 п. 14: тумблер с источником и справкой — источник мелко (label-small) в строке
// подсказки, «?» открывает поповер, ряд не выходит за экран на 390.
async function тумблерСоСправкой(b) {
  for (const w of [1280, 390]) {
    const ctx = await b.newContext({ viewport: { width: w, height: 900 } });
    const p = await ctx.newPage();
    await p.goto(адрес('тумблер'), { waitUntil: 'networkidle' });
    const обр = образец(p, 'Источник значения и справка');
    const з = await обр.locator('.docs-sample__preview .field-help').evaluate((h) => ({
      кегльИсточника: getComputedStyle(h.querySelector('.field__origin')).fontSize,
      кегльПодсказки: getComputedStyle(h.querySelector('.toggle__hint')).fontSize,
      право: Math.round(h.getBoundingClientRect().right), экран: innerWidth,
    }));
    проверить(parseFloat(з.кегльИсточника) <= parseFloat(з.кегльПодсказки),
      `тумблер ${w}: источник не крупнее подсказки (${з.кегльИсточника} при ${з.кегльПодсказки})`);
    проверить(з.право <= з.экран, `тумблер ${w}: ряд в пределах экрана`);
    await обр.locator('.docs-sample__preview button.help').click();
    await p.waitForTimeout(300);
    проверить(await обр.locator('.docs-sample__preview .help__pop').isVisible(), `тумблер ${w}: «?» открывает справку`);
    await обр.screenshot({ path: path.join(OUT, `тумблер-справка-${w}.png`) });
    await ctx.close();
  }
}

(async () => {
  const b = await браузер();
  try {
    await имяКарточки(b);
    await блокКоманды(b);
    await окноПоЦентру(b);
    await окнаНаТелефоне(b);
    await карточкаВКарточке(b);
    await ссылкиВТексте(b);
    await целиКасания(b);
    await рубрики(b);
    await сегментыНаТелефоне(b);
    await тумблерСоСправкой(b);
  } finally {
    await b.close();
  }
  console.log(беды.length ? `\nБЕД: ${беды.length}` : '\nвсё как обещано');
  process.exit(беды.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });

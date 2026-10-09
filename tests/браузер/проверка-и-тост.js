// Проверка до отправки и тост из ответа (выпуск 0.12, шаги 18 и 19) на образце сайта
// документации (/образец-проверки): отказ браузера под полем словами словаря, занятость
// имени с сервера, отказ сервера на тех же местах, очередь тостов из ответов тихой отправки,
// тост тревоги, который не закрывается сам, — со скриптом и без.
// Сайт документации должен быть запущен:
//
//   cd документация && oscript main.os --порт 3397
//   NODE_PATH=/tmp/claude-501/pw/node_modules node tests/браузер/проверка-и-тост.js [адрес] [каталог снимков]
//
// Код выхода 1, если что-то из обещанного не так. Снимки (1280 и 390 px, обе темы) — в каталог
// снимков; в репозиторий их не кладут.

const { chromium } = require('playwright-core');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const B = process.argv[2] || 'http://localhost:3397';
const OUT = process.argv[3] || '/tmp/claude-501/снимки-проверки';
const ОБРАЗЕЦ = B + '/' + encodeURIComponent('образец-проверки');
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

// Метка на window: пережила — значит, страница не перезагружалась.
async function пометить(p) { await p.evaluate(() => { window.__метка = 1; }); }
async function безПерезагрузки(p) { return p.evaluate(() => window.__метка === 1); }

// Что видно под полем: текст отказа, пометка поля, ссылка на текст, класс подписи.
async function отказ(p, имя) {
  return p.evaluate((имя) => {
    const поле = document.querySelector(`[name="${имя}"]`);
    const подпись = поле.closest('.field');
    const текст = подпись.querySelector(':scope > .field__error');
    return {
      текст: текст ? текст.textContent : '',
      последний: !!текст && подпись.lastElementChild === текст,
      роль: текст ? текст.getAttribute('role') : '',
      id: текст ? текст.id : '',
      invalid: поле.getAttribute('aria-invalid'),
      describedby: поле.getAttribute('aria-describedby') || '',
      класс: подпись.classList.contains('field--error'),
      фокус: document.activeElement === поле,
    };
  }, имя);
}

async function тосты(p) {
  return p.evaluate(() => [...document.querySelectorAll('.toast')].map((т) => ({
    текст: т.querySelector('.toast__text').textContent,
    живой: т.getAttribute('data-toast-live'),
    роль: т.getAttribute('role'),
    виден: getComputedStyle(т).display !== 'none' && т.getBoundingClientRect().height > 0,
    внизу: getComputedStyle(т).position === 'fixed',
  })));
}

async function шаг18(b) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  const p = await ctx.newPage();
  const отправки = [];
  p.on('request', (r) => { if (r.method() === 'POST') отправки.push(r.url()); });
  await p.goto(ОБРАЗЕЦ, { waitUntil: 'networkidle' });
  await пометить(p);

  // неверный адрес не уходит, текст отказа — у поля, словами словаря
  await p.fill('#name', 'my-project');
  await p.fill('#site', 'пример.рф');
  await p.click('form#novyi-proekt button[type=submit]');
  await p.waitForTimeout(300);
  let о = await отказ(p, 'site');
  проверить(отправки.length === 0, '18: форма с неверным адресом не ушла');
  проверить(о.текст === 'Нужен адрес страницы целиком, например https://пример.рф',
    `18: под полем адреса — текст словаря («${о.текст}»)`);
  проверить(о.invalid === 'true' && о.класс && о.последний && о.роль === 'alert',
    '18: поле aria-invalid, подпись field--error, текст последним ребёнком с role=alert');
  проверить(о.id === 'site-err' && о.describedby.split(' ').includes('site-err'),
    '18: поле ссылается на текст из aria-describedby');
  проверить(о.фокус, '18: фокус на первом негодном поле');

  // исправленное поле снимает отказ сразу, на вводе
  await p.fill('#site', 'https://пример.рф');
  о = await отказ(p, 'site');
  проверить(!о.текст && о.invalid === null && !о.класс && !о.describedby.includes('site-err'),
    '18: исправил — отказ ушёл на вводе');

  // уход из поля: короткое имя отбивается без отправки
  await p.fill('#name', 'a');
  await p.focus('#mail');
  о = await отказ(p, 'name');
  проверить(о.текст === 'Не короче 2 символов', `18: на уходе из поля — длина («${о.текст}»)`);
  // нетронутое поле на уходе молчит
  await p.focus('#limit');
  проверить(!(await отказ(p, 'mail')).текст, '18: нетронутое поле на уходе молчит');
  await p.fill('#limit', '99');
  await p.focus('#mail');
  проверить((await отказ(p, 'limit')).текст === 'Не больше 50', '18: предел числа — текстом словаря');
  await p.fill('#limit', '');

  // занятое имя подсвечено после ответа сервера
  const вопросы = [];
  p.on('response', (r) => { if (r.url().includes(encodeURIComponent('имя'))) вопросы.push(r.status()); });
  await p.fill('#name', 'alpha');
  await p.waitForTimeout(250);
  проверить(!(await отказ(p, 'name')).текст, '18: пока человек набирает, сервер не спрашивают');
  await p.waitForTimeout(900);
  о = await отказ(p, 'name');
  проверить(вопросы.includes(409), `18: сервер спрошен и ответил 409 (${вопросы.join(',')})`);
  проверить(о.текст === 'Имя «alpha» уже занято — выберите другое' && о.invalid === 'true',
    `18: занятое имя подсвечено после ответа («${о.текст}»)`);
  await p.click('form#novyi-proekt button[type=submit]');
  await p.waitForTimeout(300);
  проверить(отправки.length === 0, '18: форма с занятым именем не ушла');
  проверить((await отказ(p, 'name')).фокус, '18: фокус на занятом имени');

  await p.fill('#name', 'free-name');
  await p.waitForTimeout(1100);
  о = await отказ(p, 'name');
  проверить(!о.текст && о.invalid === null && вопросы.includes(200), '18: свободное имя — отказа нет (200)');

  // ошибка сервера морфится в те же места: имя уходит Enter-ом прямо из поля, раньше, чем
  // проверка успела спросить сервер (уход из поля спросил бы сразу и не пустил бы форму)
  await p.fill('#site', '');
  await p.fill('#name', 'beta');
  await p.press('#name', 'Enter');
  // ответ сервера — страница с тостом ошибки: ждём его, а не отказ проверки на уходе из поля
  await p.waitForFunction(() => document.querySelector('.toast[role="alert"]'));
  о = await отказ(p, 'name');
  проверить(отправки.length === 1, '18: форма ушла (проверка на сервере ещё не ответила)');
  проверить(о.текст === 'Имя «beta» уже занято — выберите другое' && о.последний && о.id === 'name-err'
    && о.invalid === 'true', '18: отказ сервера — в том же field__error, поле aria-invalid');
  проверить(await безПерезагрузки(p), '18: отказ пришёл тихой отправкой, без перезагрузки');
  проверить(await p.inputValue('#name') === 'beta', '18: набранное на месте');

  // шаг 19: тост тревоги из ответа (400 → role=alert) не закрывается сам и стоит на месте
  let т = await тосты(p);
  const тревога = т.find((x) => x.роль === 'alert');
  проверить(тревога && !тревога.живой && тревога.виден && !тревога.внизу,
    '19: тост тревоги из ответа остался на своём месте в потоке');
  await p.waitForTimeout(5600);
  т = await тосты(p);
  проверить(т.some((x) => x.роль === 'alert' && x.виден), '19: тост тревоги не закрылся сам через 5 с');
  await ctx.close();
}

async function шаг19(b) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  const p = await ctx.newPage();
  await p.goto(ОБРАЗЕЦ, { waitUntil: 'networkidle' });
  await пометить(p);

  // два ответа подряд — два тоста по очереди
  await p.fill('#name', 'first-one');
  await p.click('form#novyi-proekt button[type=submit]');
  await p.waitForFunction(() => document.querySelector('.toast[data-toast-live="show"]'));
  const t0 = Date.now();
  let т = await тосты(p);
  проверить(т.length === 1 && т[0].текст === 'Проект «first-one» создан' && т[0].виден && т[0].внизу,
    '19: тост первого ответа показан внизу экрана');
  проверить(await p.inputValue('#name') === '', '19: удачная форма сброшена');

  await p.fill('#name', 'second-one');
  await p.click('form#novyi-proekt button[type=submit]');
  await p.waitForFunction(() => document.querySelector('.toast[data-toast-live="wait"]'));
  т = await тосты(p);
  const первый = т.find((x) => x.текст === 'Проект «first-one» создан');
  const второй = т.find((x) => x.текст === 'Проект «second-one» создан');
  проверить(т.length === 2 && первый && первый.виден && второй && !второй.виден && второй.живой === 'wait',
    '19: второй тост ждёт очереди, пока виден первый');
  проверить(await безПерезагрузки(p), '19: оба ответа — без перезагрузки');

  await p.waitForFunction(() => {
    const с = document.querySelector('.toast[data-toast-live="show"] .toast__text');
    return с && с.textContent.includes('second-one');
  }, null, { timeout: 8000 });
  const прошло = Date.now() - t0;
  т = await тосты(p);
  проверить(т.length === 1 && т[0].текст === 'Проект «second-one» создан' && т[0].виден,
    `19: первый закрылся сам, второй показан (через ${прошло} мс)`);
  проверить(прошло > 4500 && прошло < 6500, '19: первый тост виден около 5 с');

  // мышь на тосте останавливает время
  await p.hover('.toast[data-toast-live="show"]');
  await p.waitForTimeout(5600);
  проверить((await тосты(p)).some((x) => x.виден), '19: пока на тосте мышь, он не закрывается');
  await p.mouse.move(5, 5);
  await p.waitForFunction(() => !document.querySelector('.toast'), null, { timeout: 7000 });
  проверить(true, '19: мышь ушла — тост закрылся, очередь пуста');
  проверить(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), '19: без прокрутки вбок');
  await ctx.close();
}

async function безСкрипта(b) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, javaScriptEnabled: false });
  const p = await ctx.newPage();
  await p.goto(ОБРАЗЕЦ, { waitUntil: 'networkidle' });

  // неверный адрес не пускает браузер сам; ушедшее отбивает сервер теми же словами
  await p.fill('#name', 'alpha');
  await p.fill('#site', 'пример.рф');
  await p.click('form#novyi-proekt button[type=submit]');
  await p.waitForTimeout(400);
  проверить(!(await p.evaluate(() => document.querySelector('.field__error'))),
    'без скрипта: неверный адрес не ушёл (не пускает браузер)');
  await p.fill('#site', '');
  await Promise.all([p.waitForNavigation(), p.click('form#novyi-proekt button[type=submit]')]);
  const ошибка = await p.evaluate(() => {
    const е = document.querySelector('#name').closest('.field').querySelector('.field__error');
    return е ? е.textContent : '';
  });
  проверить(ошибка === 'Имя «alpha» уже занято — выберите другое', 'без скрипта: занятость отбивает сервер');
  проверить(await p.evaluate(() => !!document.querySelector('.toast[role="alert"]')),
    'без скрипта: тост ошибки на странице');

  // Enter в поле — та же отправка формы; щелчок по кнопке страницы без скрипта Playwright
  // не считает «устойчивым», пока въезжает тост ошибки
  await p.fill('#name', 'plain-one');
  await Promise.all([p.waitForNavigation(), p.press('#name', 'Enter')]);
  await p.waitForTimeout(5600);
  const т = await p.evaluate(() => [...document.querySelectorAll('.toast')].map((т) => т.textContent));
  проверить(т.length === 1 && т[0].includes('plain-one'), 'без скрипта: тост успеха стоит на странице и через 5 с');
  await ctx.close();
}

async function снимки(b) {
  for (const ширина of [1280, 390]) {
    for (const тема of ['light', 'dark']) {
      const ctx = await b.newContext({ viewport: { width: ширина, height: 800 }, deviceScaleFactor: 1 });
      const p = await ctx.newPage();
      await p.goto(ОБРАЗЕЦ, { waitUntil: 'networkidle' });
      await p.evaluate((т) => { document.documentElement.dataset.theme = т; }, тема);
      const имя = `${ширина}-${тема}`;
      await p.fill('#name', 'alpha');
      await p.fill('#site', 'пример.рф');
      await p.fill('#limit', '99');
      await p.waitForTimeout(1100);
      await p.click('form#novyi-proekt button[type=submit]');
      await p.waitForTimeout(300);
      await p.screenshot({ path: path.join(OUT, `проверка-${имя}.png`) });
      await p.fill('#name', 'snap-one');
      await p.fill('#site', '');
      await p.fill('#limit', '');
      await p.waitForTimeout(1100);
      await p.click('form#novyi-proekt button[type=submit]');
      await p.waitForFunction(() => document.querySelector('.toast[data-toast-live="show"]'));
      // ответ сервера вернул странице тему по cookie — снимку нужна выбранная
      await p.evaluate((т) => { document.documentElement.dataset.theme = т; }, тема);
      await p.waitForTimeout(400);
      await p.screenshot({ path: path.join(OUT, `тост-${имя}.png`) });
      if (ширина <= 640) {
        const край = await p.evaluate(() => {
          const к = document.querySelector('.toast[data-toast-live="show"]').getBoundingClientRect();
          return { л: к.left, п: innerWidth - к.right, н: innerHeight - к.bottom };
        });
        проверить(край.л >= 15 && край.п >= 15 && край.н >= 15,
          `${имя}: тост внутри экрана с полями (${Math.round(край.л)}/${Math.round(край.п)}/${Math.round(край.н)})`);
      }
      проверить(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${имя}: без прокрутки вбок`);
      await ctx.close();
    }
  }
}

(async () => {
  const b = await браузер();
  await шаг18(b);
  await шаг19(b);
  await безСкрипта(b);
  await снимки(b);
  await b.close();
  if (беды.length) { console.error('\nБЕДЫ:\n' + беды.join('\n')); process.exit(1); }
  console.log('ок, снимки в ' + OUT);
})().catch((e) => { console.error(e); process.exit(1); });

// Окна выпуска 0.11 на образце сайта документации (/образец-окон): окно со слотами,
// закрытие по успеху тихой отправки, окно по адресу, подтверждение — со скриптом и без.
// Сайт документации должен быть запущен:
//
//   cd документация && oscript main.os --порт 3391
//   NODE_PATH=/tmp/claude-501/pw/node_modules node tests/браузер/окна.js [адрес] [каталог снимков]
//
// Код выхода 1, если что-то из обещанного не так. Снимки (1280 и 390 px, обе темы) — в каталог
// снимков; в репозиторий их не кладут.

const { chromium } = require('playwright-core');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const B = process.argv[2] || 'http://localhost:3391';
const OUT = process.argv[3] || '/tmp/claude-501/снимки-окон';
const ОБРАЗЕЦ = B + '/' + encodeURIComponent('образец-окон');
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

async function открытоеОкно(p) {
  return p.evaluate(() => {
    const d = [...document.querySelectorAll('dialog')].find((x) => x.open);
    if (!d) return null;
    const имя = document.getElementById(d.getAttribute('aria-labelledby') || '');
    return { id: d.id, модальное: d.matches(':modal'), имя: имя ? имя.textContent : '',
      классы: d.className, оболочка: d.hasAttribute('data-window-shell') };
  });
}

async function шаг6и7(b) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  const p = await ctx.newPage();
  await p.goto(ОБРАЗЕЦ, { waitUntil: 'networkidle' });
  await пометить(p);

  // шаг 6: открывашка, имя окна, Esc и возврат фокуса
  const открывашка = p.locator('button[command="show-modal"][commandfor="novyi-proekt"]');
  await открывашка.click();
  let окно = await открытоеОкно(p);
  проверить(окно && окно.id === 'novyi-proekt' && окно.модальное, '6: кнопка открыла окно модальным');
  проверить(окно && окно.имя === 'Новый проект', '6: окно названо заголовком (aria-labelledby)');
  const порядок = await p.evaluate(() => [...document.querySelector('#novyi-proekt .modal__box').children]
    .map((э) => э.className.split(' ')[0]).filter(Boolean).join(','));
  проверить(порядок === 'modal__head,modal__lead,modal__body,modal__actions', '6: слоты по порядку: ' + порядок);
  await p.keyboard.press('Escape');
  проверить(!(await открытоеОкно(p)), '6: Esc закрыл окно');
  проверить(await p.evaluate(() => document.activeElement.getAttribute('commandfor') === 'novyi-proekt'),
    '6: фокус вернулся на открывашку');

  // шаг 7: 400 — окно открыто, поле отбито, введённое на месте
  await открывашка.click();
  await p.fill('#novyi-proekt-name', 'Я');
  await p.click('#novyi-proekt .modal__actions button[type=submit]');
  await p.waitForSelector('#novyi-proekt [aria-invalid="true"]');
  окно = await открытоеОкно(p);
  проверить(окно && окно.id === 'novyi-proekt', '7: после 400 окно открыто');
  проверить(await p.inputValue('#novyi-proekt-name') === 'Я', '7: введённое на месте');
  проверить(await p.evaluate(() => document.activeElement.id === 'novyi-proekt-name'), '7: фокус на отбитом поле');
  проверить(await безПерезагрузки(p), '7: без перезагрузки (400)');

  // шаг 7: 303 — окна нет, новая запись в DOM и в фокусе
  await p.fill('#novyi-proekt-name', 'Дельта');
  await p.click('#novyi-proekt .modal__actions button[type=submit]');
  await p.waitForSelector('tr[data-focus]');
  await p.waitForTimeout(100);
  проверить(!(await открытоеОкно(p)), '7: после 303 окно закрыто');
  const фокус = await p.evaluate(() => {
    const э = document.activeElement;
    return { tr: э.tagName === 'TR' && э.hasAttribute('data-focus'), текст: э.textContent };
  });
  проверить(фокус.tr && фокус.текст.startsWith('Дельта'), '7: новая запись в фокусе: ' + фокус.текст.slice(0, 20));
  проверить(await безПерезагрузки(p), '7: без перезагрузки (303)');
  проверить(decodeURIComponent(p.url()).includes('добавлено=Дельта'), '7: адрес вкладки — адрес ответа');
  await p.click('button[command="show-modal"][commandfor="novyi-proekt"]');
  проверить(await p.inputValue('#novyi-proekt-name') === '', '7: удачная форма сброшена');
  await ctx.close();
}

async function шаг8(b) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  const p = await ctx.newPage();
  await p.goto(ОБРАЗЕЦ, { waitUntil: 'networkidle' });
  await пометить(p);

  const кнопок = await p.locator('a[data-window-link]').count();
  const оболочек = await p.locator('[data-window-shell]').count();
  проверить(кнопок === 3 && оболочек === 1, `8: оболочка одна при ${кнопок} кнопках (${оболочек})`);

  await p.locator('a[data-window-link]').first().click();
  await p.waitForSelector('dialog[data-window-shell][open]');
  let окно = await открытоеОкно(p);
  проверить(окно && окно.оболочка && окно.модальное && окно.имя === 'Переименовать «Альфа»',
    '8: фрагмент загружен в оболочку и открыт: ' + (окно && окно.имя));
  проверить(await безПерезагрузки(p) && !p.url().includes('окно'), '8: без перехода по ссылке');

  await p.fill('dialog[data-window-shell] input[name=name]', 'Б');
  await p.click('dialog[data-window-shell] .modal__actions button[type=submit]');
  await p.waitForSelector('dialog[data-window-shell] [aria-invalid="true"]');
  окно = await открытоеОкно(p);
  проверить(окно && окно.оболочка, '8: отказ остался в оболочке');
  проверить(await p.inputValue('dialog[data-window-shell] input[name=name]') === 'Б', '8: введённое на месте');

  await p.fill('dialog[data-window-shell] input[name=name]', 'Омега');
  await p.click('dialog[data-window-shell] .modal__actions button[type=submit]');
  await p.waitForSelector('tr[data-focus]');
  await p.waitForTimeout(100);
  проверить(!(await открытоеОкно(p)), '8: успех закрыл окно');
  const строки = await p.$$eval('tbody tr td:first-child', (т) => т.map((x) => x.textContent));
  проверить(строки.includes('Омега') && !строки.includes('Альфа'), '8: запись переименована: ' + строки.join(','));
  проверить(await безПерезагрузки(p), '8: без перезагрузки');
  проверить(await p.evaluate(() => document.querySelector('[data-window-shell]').children.length === 0),
    '8: оболочка снова пуста');

  // ошибка загрузки — тост
  await p.route('**/*окно=правка*', (r) => r.abort());
  await p.route(/%D0%BE%D0%BA%D0%BD%D0%BE=/i, (r) => r.abort());
  await p.locator('a[data-window-link]').first().click();
  await p.waitForSelector('[data-window-error]:not([hidden])', { timeout: 3000 }).catch(() => {});
  проверить(await p.isVisible('[data-window-error] .toast'), '8: ошибка загрузки — тост');
  проверить(!(await открытоеОкно(p)), '8: при ошибке окно не открыто');
  await ctx.close();
}

async function шаг9(b) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  const p = await ctx.newPage();
  await p.goto(ОБРАЗЕЦ, { waitUntil: 'networkidle' });
  await пометить(p);
  let запросы = 0;
  p.on('request', (r) => { if (r.method() === 'POST') запросы++; });

  await p.click('#udalit-2-form button[type=submit]');
  await p.waitForTimeout(200);
  проверить(запросы === 0, '9: форма с data-confirm не ушла без подтверждения');
  const окно = await открытоеОкно(p);
  проверить(окно && окно.id === 'udalit-2' && окно.модальное && окно.классы.includes('modal--danger'),
    '9: открылось опасное окно подтверждения');
  const кнопка = '#udalit-2 [name=confirmed]';
  проверить(await p.isDisabled(кнопка), '9: кнопка заблокирована, пока эхо пусто');
  await p.fill('#udalit-2-echo', 'Бет');
  проверить(await p.isDisabled(кнопка), '9: несовпавший образец кнопку не открывает');
  await p.fill('#udalit-2-echo', 'Бета');
  проверить(!(await p.isDisabled(кнопка)), '9: совпавший образец открывает кнопку');

  // отмена — форма так и не ушла; новое открытие — поле пустое
  await p.click('#udalit-2 .modal__actions .button--ghost');
  await p.waitForTimeout(100); // событие close приходит задачей
  проверить(!(await открытоеОкно(p)) && запросы === 0, '9: отмена закрыла окно, форма не ушла');
  проверить(await p.isDisabled('#udalit-2-echo'), '9: эхо закрытого окна снова заблокировано');

  await p.click('#udalit-2-form button[type=submit]');
  await p.fill('#udalit-2-echo', 'Бета');
  await p.click(кнопка);
  await p.waitForFunction(() => ![...document.querySelectorAll('tbody td:first-child')]
    .some((x) => x.textContent === 'Бета'));
  проверить(запросы === 1 && !(await открытоеОкно(p)), '9: подтверждённая форма ушла один раз, окно закрыто');
  проверить(await безПерезагрузки(p), '9: без перезагрузки');
  await ctx.close();
}

async function безСкрипта(b) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, javaScriptEnabled: false });
  let p = await ctx.newPage();
  await p.goto(ОБРАЗЕЦ, { waitUntil: 'networkidle' });

  // окно открывает движок, форма уходит обычным POST
  await p.click('button[command="show-modal"][commandfor="novyi-proekt"]');
  проверить(await p.evaluate(() => document.getElementById('novyi-proekt').open), 'без JS: команда движка открыла окно');
  await p.fill('#novyi-proekt-name', 'Я');
  await p.click('#novyi-proekt .modal__actions button[type=submit]');
  await p.waitForLoadState('networkidle');
  проверить(await p.evaluate(() => document.getElementById('novyi-proekt').hasAttribute('open')
    && !!document.querySelector('#novyi-proekt [aria-invalid="true"]')), 'без JS: 400 — страница с окном открытым');

  // окно по адресу — ссылка на страницу с окном. Новая вкладка на каждую дорогу: headless
  // без скрипта после закрытого модального окна перестаёт рисовать кадры
  await p.close();
  p = await ctx.newPage();
  await p.goto(ОБРАЗЕЦ, { waitUntil: 'networkidle' });
  await p.locator('a[data-window-link]').first().click();
  await p.waitForLoadState('networkidle');
  проверить(decodeURIComponent(p.url()).includes('окно=правка')
    && await p.evaluate(() => !!document.querySelector('#pravka[open]')), 'без JS: ссылка ведёт на страницу с окном');

  // подтверждение спрашивает сервер страницей на GET того же адреса
  await p.close();
  p = await ctx.newPage();
  await p.goto(ОБРАЗЕЦ, { waitUntil: 'networkidle' });
  await p.click('#udalit-1-form button[type=submit]');
  await p.waitForLoadState('networkidle');
  проверить(decodeURIComponent(p.url()).includes('/образец-окон/удалить?project=Альфа')
    && await p.evaluate(() => !!document.querySelector('#udalit-1[open]')), 'без JS: подтверждение — страница на GET');
  проверить(!(await p.isDisabled('#udalit-1-echo')), 'без JS: эхо открытого подтверждения доступно');
  await p.fill('#udalit-1-echo', 'Альфа');
  // headless без скрипта после навигации в той же вкладке не рисует кадров, и проверка
  // «элемент устоялся» ждёт их вечно: щелчок — без неё
  await p.click('#udalit-1 [name=confirmed]', { force: true });
  await p.waitForLoadState('networkidle');
  const строки = await p.$$eval('tbody tr td:first-child', (т) => т.map((x) => x.textContent));
  проверить(!строки.includes('Альфа'), 'без JS: подтверждённое удаление прошло: ' + строки.join(','));
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
      await p.click('button[command="show-modal"][commandfor="novyi-proekt"]');
      await p.waitForTimeout(400);
      if (ширина <= 640) {
        const лист = await p.evaluate(() => {
          const d = document.getElementById('novyi-proekt');
          const к = d.getBoundingClientRect();
          const д = d.querySelector('.modal__actions').getBoundingClientRect();
          return { w: к.width, h: к.height, низ: д.bottom, вв: innerHeight, шв: innerWidth };
        });
        проверить(Math.abs(лист.w - лист.шв) < 2 && Math.abs(лист.h - лист.вв) < 2,
          `${имя}: окно — лист во весь экран (${лист.w}×${лист.h})`);
        проверить(Math.abs(лист.низ - лист.вв) < 2, `${имя}: действия прилипли к низу (${лист.низ}/${лист.вв})`);
      }
      await p.screenshot({ path: path.join(OUT, `окно-${имя}.png`) });
      await p.keyboard.press('Escape');
      await p.click('#udalit-1-form button[type=submit]');
      await p.fill('#udalit-1-echo', 'Аль');
      await p.waitForTimeout(400);
      await p.screenshot({ path: path.join(OUT, `подтверждение-${имя}.png`) });
      проверить(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${имя}: без прокрутки вбок`);
      await ctx.close();
    }
  }
}

(async () => {
  const b = await браузер();
  await шаг6и7(b);
  await шаг8(b);
  await шаг9(b);
  await безСкрипта(b);
  await снимки(b);
  await b.close();
  if (беды.length) { console.error('\nБЕДЫ:\n' + беды.join('\n')); process.exit(1); }
  console.log('ок, снимки в ' + OUT);
})().catch((e) => { console.error(e); process.exit(1); });

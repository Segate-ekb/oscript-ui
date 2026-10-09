// Страницы и отбор без перезагрузки (выпуск 0.13, шаг 20) на образце сайта документации
// (/образец-списка): страница 2 без перезагрузки и с прежней прокруткой, «Назад» и «Вперёд»
// браузера тихо, сортировка колонки (aria-sort), отбор по набору с задержкой одним запросом,
// «Назад» после отбора возвращает поле и список; без скрипта — обычные ссылки и GET-форма.
// Сайт документации должен быть запущен:
//
//   cd документация && oscript main.os --порт 3420
//   NODE_PATH=/tmp/claude-501/pw/node_modules node tests/браузер/страницы-и-отбор.js [адрес] [каталог снимков]
//
// Код выхода 1, если что-то из обещанного не так. Снимки (1280 и 390 px, обе темы) — в каталог
// снимков; в репозиторий их не кладут.

const { chromium } = require('playwright-core');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const B = process.argv[2] || 'http://localhost:3420';
const OUT = process.argv[3] || '/tmp/claude-501/снимки-списка';
const ПУТЬ = '/' + encodeURIComponent('образец-списка');
const ОБРАЗЕЦ = B + ПУТЬ;
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

async function вид(p) {
  return p.evaluate(() => ({
    состояние: (document.querySelector('.pagination__status') || {}).textContent || '',
    счёт: (document.querySelector('.pagination__count') || {}).textContent || '',
    первая: (document.querySelector('tbody tr td') || {}).textContent || '',
    строк: document.querySelectorAll('tbody tr').length,
    поиск: document.querySelector('input[name=q]').value,
    адрес: decodeURIComponent(location.search),
    сорт: [...document.querySelectorAll('th')].map((т) => т.getAttribute('aria-sort') || '-').join(','),
  }));
}

async function ждатьСостояния(p, текст) {
  await p.waitForFunction((т) => {
    const с = document.querySelector('.pagination__status');
    return с && с.textContent === т;
  }, текст, { timeout: 5000 });
}

async function соСкриптом(b) {
  // низкое окно: страницу есть куда прокрутить, и видно, что прокрутка не прыгает
  const ctx = await b.newContext({ viewport: { width: 1280, height: 520 } });
  const p = await ctx.newPage();
  const запросы = [];
  p.on('request', (r) => { if (r.url().startsWith(ОБРАЗЕЦ) && r.resourceType() === 'fetch') запросы.push(r.url()); });
  await p.goto(ОБРАЗЕЦ, { waitUntil: 'networkidle' });
  await пометить(p);

  const до = await вид(p);
  проверить(до.состояние === 'Страница 1 из 5' && до.счёт === '1–10 из 48',
    `первая страница: «${до.состояние}», «${до.счёт}»`);
  проверить(await p.getAttribute('.pagination__link--next', 'data-quiet') === '', 'ссылка страницы с data-quiet');
  проверить(await p.getAttribute('.pagination__status', 'aria-live') === 'polite', 'состояние — живая область');

  // страница 2 без перезагрузки, прокрутка на месте, адрес в истории
  await p.evaluate(() => document.querySelector('.pagination').scrollIntoView({ block: 'end' }));
  const прокрутка = await p.evaluate(() => scrollY);
  await p.click('.pagination__link--next');
  await ждатьСостояния(p, 'Страница 2 из 5');
  const второй = await вид(p);
  проверить(await безПерезагрузки(p), 'страница 2 без перезагрузки');
  проверить(второй.адрес.includes('page=2'), `адрес страницы 2: ${второй.адрес}`);
  проверить(второй.счёт === '11–20 из 48' && второй.первая !== до.первая,
    `на странице 2 другие записи: «${второй.счёт}», первая «${второй.первая}»`);
  проверить(прокрутка > 0 && Math.abs(await p.evaluate(() => scrollY) - прокрутка) < 40,
    `прокрутка осталась (${прокрутка} → ${await p.evaluate(() => scrollY)})`);
  проверить(await p.evaluate(() => history.length) >= 2, 'переход лёг в историю вкладки');
  проверить(await p.evaluate(() => !document.querySelector('[aria-busy]')), 'отметка «в пути» снята');

  // «Назад» возвращает страницу 1 — тихо и на ту же прокрутку
  await p.goBack();
  await ждатьСостояния(p, 'Страница 1 из 5');
  const назад = await вид(p);
  проверить(await безПерезагрузки(p), '«Назад» без перезагрузки');
  проверить(назад.первая === до.первая && !назад.адрес.includes('page=2'),
    `«Назад» вернул страницу 1: первая «${назад.первая}», адрес «${назад.адрес}»`);
  проверить(Math.abs(await p.evaluate(() => scrollY) - прокрутка) < 40, '«Назад» вернул прокрутку');

  // «Вперёд» — снова страница 2
  await p.goForward();
  await ждатьСостояния(p, 'Страница 2 из 5');
  проверить(await безПерезагрузки(p), '«Вперёд» без перезагрузки');

  // сортировка колонки: ссылка в заголовке, aria-sort переезжает, страница сбрасывается
  await p.click('th >> text=Участников');
  await p.waitForFunction(() => location.search.includes('sort=members'));
  await ждатьСостояния(p, 'Страница 1 из 5');
  const сорт = await вид(p);
  проверить(await безПерезагрузки(p), 'сортировка без перезагрузки');
  проверить(сорт.сорт === '-,-,ascending', `aria-sort у «Участников»: ${сорт.сорт}`);
  await p.click('th >> text=Участников');
  await p.waitForFunction(() => location.search.includes('order=desc'));
  await p.waitForFunction(() => document.querySelectorAll('th')[2].getAttribute('aria-sort') === 'descending');
  проверить(true, 'повторный щелчок — по убыванию');

  // отбор по набору: один запрос после паузы, фокус в поле, страниц не осталось
  const былоЗапросов = запросы.length;
  await p.click('input[name=q]');
  await p.keyboard.type('бета', { delay: 60 });
  await p.waitForFunction(() => decodeURIComponent(location.search).includes('q=бета'), null, { timeout: 5000 });
  await p.waitForFunction(() => document.querySelectorAll('tbody tr').length === 4);
  await p.waitForTimeout(700);
  const отбор = await вид(p);
  проверить(await безПерезагрузки(p), 'отбор без перезагрузки');
  проверить(запросы.length - былоЗапросов === 1, `отбор ушёл одним запросом (${запросы.length - былоЗапросов})`);
  проверить(await p.evaluate(() => document.activeElement && document.activeElement.name === 'q'), 'фокус остался в поле');
  проверить(отбор.поиск === 'бета' && отбор.строк === 4 && !отбор.состояние,
    `отобрано 4, навигации нет: «${отбор.поиск}», ${отбор.строк}, «${отбор.состояние}»`);
  проверить(отбор.адрес.includes('sort=members') && отбор.адрес.includes('order=desc'),
    `отбор помнит сортировку: ${отбор.адрес}`);

  // «Назад» после отбора: поле и список — как были до отбора
  await p.goBack();
  await p.waitForFunction(() => !location.search.includes('q='), null, { timeout: 5000 });
  await p.waitForFunction(() => document.querySelectorAll('tbody tr').length === 10);
  const доОтбора = await вид(p);
  проверить(await безПерезагрузки(p), '«Назад» после отбора без перезагрузки');
  проверить(доОтбора.поиск === '' && доОтбора.строк === 10, `поле пустое, записей 10: «${доОтбора.поиск}», ${доОтбора.строк}`);

  // ссылка с Ctrl/Cmd — браузеру: новая вкладка, страница не трогается
  const вкладка = ctx.waitForEvent('page', { timeout: 3000 }).catch(() => null);
  await p.click('.pagination__link--next', { modifiers: [process.platform === 'darwin' ? 'Meta' : 'Control'] });
  проверить(!!(await вкладка), 'Ctrl/Cmd+щелчок открывает новую вкладку');
  await ctx.close();
}

async function безСкрипта(b) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, javaScriptEnabled: false });
  const p = await ctx.newPage();
  await p.goto(ОБРАЗЕЦ, { waitUntil: 'networkidle' });
  await p.click('.pagination__link--next');
  await p.waitForURL(/page=2/);
  проверить((await p.textContent('.pagination__status')) === 'Страница 2 из 5', 'без скрипта: ссылка ведёт на страницу 2');
  // после перехода между документами движок ведёт View Transition, и без скрипта Playwright
  // не дожидается «стабильного» элемента — щелчок тот же, по координатам ссылки
  await p.click('th:first-child a.table__sort', { force: true });
  await p.waitForURL(/order=desc/);
  проверить((await p.getAttribute('th:first-child', 'aria-sort')) === 'descending', 'без скрипта: сортировка ссылкой');
  await p.fill('input[name=q]', 'гамма');
  await p.press('input[name=q]', 'Enter');
  await p.waitForURL(/q=/);
  проверить((await p.$$('tbody tr')).length === 4 && decodeURIComponent(p.url()).includes('q=гамма'),
    'без скрипта: отбор обычной GET-формой');
  await ctx.close();
}

async function снимки(b) {
  for (const ширина of [1280, 390]) {
    for (const тема of ['light', 'dark']) {
      const ctx = await b.newContext({ viewport: { width: ширина, height: 900 }, deviceScaleFactor: 1 });
      const p = await ctx.newPage();
      await p.goto(ОБРАЗЕЦ + '?sort=members&order=desc&page=3', { waitUntil: 'networkidle' });
      await p.evaluate((т) => { document.documentElement.dataset.theme = т; }, тема);
      await p.hover('th >> text=Проект');
      await p.waitForTimeout(250);
      const имя = `${ширина}-${тема}`;
      await p.screenshot({ path: path.join(OUT, `список-${имя}.png`), fullPage: true });
      проверить(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${имя}: без прокрутки вбок`);
      await ctx.close();
    }
  }
}

(async () => {
  const b = await браузер();
  await соСкриптом(b);
  await безСкрипта(b);
  await снимки(b);
  await b.close();
  if (беды.length) { console.error('\nБЕДЫ:\n' + беды.join('\n')); process.exit(1); }
  console.log('ок, снимки в ' + OUT);
})().catch((e) => { console.error(e); process.exit(1); });

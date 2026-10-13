// Слова дев-сборки 0.13.0-dev.9 на образцах сайта документации: выбор значка (со скриптом
// и без, 1280 и 390, зеркало в плашку), пресеты темы (три пресета в обеих темах, зеркало
// в рамку образца), переключатель темы пилюлей (со скриптом — data-theme и aria-checked без
// перезагрузки, без скрипта — POST и возврат), рубрика шторки, пустое состояние с двумя
// путями и страница входа (/образец-входа, обе темы, 1280 и 390, со скриптом и без). Сайт
// документации должен быть запущен:
//
//   cd документация && oscript main.os --порт 3599
//   NODE_PATH=<каталог>/node_modules node tests/браузер/слова-дев-9.js [адрес] [каталог снимков]
//
// Код выхода 1, если что-то из обещанного не так. Снимки — в каталог снимков; в репозиторий
// их не кладут.

const { chromium } = require('playwright-core');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const B = process.argv[2] || process.env.BASE || 'http://localhost:3599';
const OUT = process.argv[3] || '/tmp/claude-501/снимки-слова-дев-9';
const КУКА = 'oscript_ui_docs';
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

async function контекст(b, ширина, скрипт = true, тема = 'светлая', высота = 900) {
  const ctx = await b.newContext({ viewport: { width: ширина, height: высота }, javaScriptEnabled: скрипт });
  await ctx.addCookies([{ name: КУКА, value: encodeURIComponent('тема=' + тема), url: B }]);
  return ctx;
}

function образец(p, подпись) {
  return p.locator('figure.docs-sample', { has: p.locator('.docs-sample__title', { hasText: подпись }) }).first();
}

async function снимок(локатор, имя) {
  await локатор.page().waitForTimeout(300);
  await локатор.screenshot({ path: path.join(OUT, `${имя}.png`) });
}

// П1: выбор значка со скриптом и без, на 1280 и 390
async function выборЗначка(b) {
  for (const ширина of [1280, 390]) {
    const ctx = await контекст(b, ширина);
    const p = await ctx.newPage();
    await p.goto(адрес('иконки'), { waitUntil: 'networkidle' });
    const ф = образец(p, 'Значок тега');
    await ф.scrollIntoViewIfNeeded();
    const поиск = ф.locator('[data-iconpicker-search]');
    проверить(await поиск.isVisible(), `П1 ${ширина}: со скриптом строка поиска видна`);
    проверить(await ф.locator('input[value="тег"]').isChecked(), `П1 ${ширина}: текущий значок отмечен`);
    const ширинаСетки = await ф.locator('.iconpicker__grid').nth(1).evaluate((el) => el.scrollWidth <= el.clientWidth + 1);
    проверить(ширинаСетки, `П1 ${ширина}: сетка без горизонтальной прокрутки`);
    await ф.locator('input[type=search]').fill('git');
    const видно = await ф.locator('.iconpicker__item:visible').count();
    проверить(видно === 4, `П1 ${ширина}: «git» оставляет «без значка» и три бренда (${видно})`);
    проверить(await ф.locator('[data-iconpicker-group]').first().isHidden(), `П1 ${ширина}: пустой раздел «Глифы» спрятан`);
    const счёт = await ф.locator('[data-iconpicker-found]').textContent();
    проверить(счёт === 'Найдено: 3', `П1 ${ширина}: счёт найденного в живой области («${счёт}»)`);
    await ф.locator('input[type=search]').press('Enter');
    проверить(await ф.locator('input[value="бренд:gitea"]').isChecked(), `П1 ${ширина}: Enter выбирает первый найденный`);
    const вПлашке = await ф.locator('.preview .tag svg').evaluate((el) => el.classList.contains('icon--brand'));
    проверить(вПлашке, `П1 ${ширина}: зеркало — значок бренда в плашке образца`);
    проверить(await ф.locator('.preview .tag').getAttribute('data-mirror-значок-тега') === 'бренд:gitea',
      `П1 ${ширина}: признак зеркала — имя значка`);
    await ф.locator('input[type=search]').fill('');
    await ф.locator('.iconpicker__grid--none .iconpicker__item').click();
    проверить(await ф.locator('.preview .tag svg').count() === 0, `П1 ${ширина}: «без значка» снимает значок плашки`);
    await ф.locator('label[title="замок"]').click();
    await p.waitForTimeout(400);
    const кольцо = await ф.locator('label[title="замок"]').evaluate((el) => getComputedStyle(el).boxShadow);
    проверить(/inset/.test(кольцо) && !/^rgba\(0, 0, 0, 0\)/.test(кольцо), `П1 ${ширина}: выбранная ячейка — кольцом (${кольцо})`);
    await снимок(ф, `выбор-значка-${ширина}`);
    await ctx.close();

    const без = await контекст(b, ширина, false);
    const п = await без.newPage();
    await п.goto(адрес('иконки'), { waitUntil: 'networkidle' });
    const фб = образец(п, 'Значок тега');
    проверить(await фб.locator('[data-iconpicker-search]').isHidden(), `П1 ${ширина} без скрипта: поиска нет`);
    проверить(await фб.locator('[data-iconpicker-group]').count() === 2, `П1 ${ширина} без скрипта: разделы «Глифы» и «Бренды»`);
    const выбран = await фб.locator('label[title="тег"]').evaluate((el) => getComputedStyle(el).boxShadow);
    проверить(/inset/.test(выбран) && !/^rgba\(0, 0, 0, 0\)/.test(выбран), `П1 ${ширина} без скрипта: выбранное видно (${выбран})`);
    await снимок(фб, `выбор-значка-без-скрипта-${ширина}`);
    await без.close();
  }

  // в окне поле работает так же — сетка и поиск внутри Кит.Окно на странице «Окно» не стоят,
  // поэтому окно собирается из образца на месте: поле переносится в <dialog>
  const ctx = await контекст(b, 1280);
  const p = await ctx.newPage();
  await p.goto(адрес('иконки'), { waitUntil: 'networkidle' });
  await p.evaluate(() => {
    const поле = document.querySelector('[data-iconpicker]');
    const окно = document.createElement('dialog');
    окно.className = 'modal';
    окно.appendChild(поле);
    document.body.appendChild(окно);
    окно.showModal();
  });
  await p.locator('dialog [data-iconpicker] input[type=search]').fill('tele');
  проверить(await p.locator('dialog .iconpicker__item:visible').count() === 2, 'П1: в окне поиск работает («без значка» и Telegram)');
  await ctx.close();
}

// П2: три пресета в обеих темах, рамка образца перекрашивается выбором сегмента
async function пресеты(b) {
  for (const тема of ['светлая', 'тёмная']) {
    const ctx = await контекст(b, 1280, true, тема);
    const p = await ctx.newPage();
    await p.goto(адрес('цвет'), { waitUntil: 'networkidle' });
    const ф = образец(p, 'Три пресета');
    await ф.scrollIntoViewIfNeeded();
    const фон = () => ф.locator('.preview__frame').evaluate((el) => getComputedStyle(el).backgroundColor);
    const кнопка = () => ф.locator('.preview__frame .button--primary').evaluate((el) => getComputedStyle(el).backgroundColor);
    const виды = {};
    for (const ключ of ['classic', 'material', 'oscript']) {
      await ф.locator(`label:has(input[value="${ключ}"])`).click();
      await p.waitForTimeout(400);
      виды[ключ] = await фон() + ' / ' + await кнопка();
      await снимок(ф, `пресет-${ключ}-${тема}`);
    }
    проверить(new Set(Object.values(виды)).size === 3, `П2 ${тема}: три пресета — три разных вида (${JSON.stringify(виды)})`);
    const ждём = тема === 'светлая' ? { oscript: 'rgb(249, 249, 249)', classic: 'rgb(243, 243, 249)' }
      : { oscript: 'rgb(27, 27, 30)', classic: 'rgb(23, 25, 37)' };
    for (const [к, цвет] of Object.entries(ждём)) {
      проверить(виды[к].startsWith(цвет), `П2 ${тема}: фон рамки ${к} — ${цвет} (${виды[к]})`);
    }
    // переключатель темы рамки показывает пресет во второй теме
    await ф.locator(`label:has(input[value="classic"])`).click();
    await ф.locator(`[data-preview-theme="${тема === 'светлая' ? 'dark' : 'light'}"]`).click();
    const второй = await фон();
    проверить(второй === (тема === 'светлая' ? 'rgb(23, 25, 37)' : 'rgb(243, 243, 249)'),
      `П2 ${тема}: рамка classic во второй теме — ${второй}`);
    await ctx.close();
  }
}

// П3: пилюля темы
async function пилюля(b) {
  for (const ширина of [1280, 390]) {
    const ctx = await контекст(b, ширина, true, 'тёмная');
    const p = await ctx.newPage();
    await p.goto(адрес('обзор'), { waitUntil: 'networkidle' });
    await p.evaluate(() => { window.__метка = 1; });
    let кнопка;
    if (ширина === 390) {
      await p.locator('.hubmenu__opener .button').click();
      кнопка = p.locator('#hubmenu form[data-theme-toggle] [role="switch"]');
    } else {
      кнопка = p.locator('header form[data-theme-toggle] [role="switch"]').first();
    }
    проверить(await кнопка.getAttribute('aria-checked') === 'true', `П3 ${ширина}: тёмная — переключатель включён`);
    const размер = await кнопка.locator('.theme-switch__track').evaluate((el) => [el.offsetWidth, el.offsetHeight].join('×'));
    проверить(размер === '44×24', `П3 ${ширина}: дорожка 44×24 (${размер})`);
    const было = await кнопка.locator('.theme-switch__thumb').evaluate((el) => getComputedStyle(el).transform);
    await кнопка.click();
    await p.waitForTimeout(400);
    проверить(await p.evaluate(() => document.documentElement.getAttribute('data-theme')) === 'light', `П3 ${ширина}: щелчок — светлая тема`);
    проверить(await кнопка.getAttribute('aria-checked') === 'false', `П3 ${ширина}: aria-checked — false`);
    проверить(await p.evaluate(() => window.__метка === 1), `П3 ${ширина}: без перезагрузки`);
    const стало = await кнопка.locator('.theme-switch__thumb').evaluate((el) => getComputedStyle(el).transform);
    проверить(было !== стало, `П3 ${ширина}: бегунок уехал (${было} → ${стало})`);
    await p.waitForTimeout(600);
    проверить(await кнопка.getAttribute('aria-label') === null || ширина === 390 || (await кнопка.getAttribute('aria-label')) === 'Тема: светлая',
      `П3 ${ширина}: подпись сверена ответом`);
    if (ширина === 1280) {
      await снимок(p.locator('header'), 'пилюля-1280-после-щелчка');
    }
    await ctx.close();
  }

  const без = await контекст(b, 1280, false, 'тёмная');
  const п = await без.newPage();
  await п.goto(адрес('обзор'), { waitUntil: 'networkidle' });
  let пост = false;
  п.on('request', (r) => { if (r.method() === 'POST') пост = true; });
  await п.locator('header form[data-theme-toggle] [role="switch"]').first().click();
  await п.waitForLoadState('networkidle');
  проверить(пост, 'П3 без скрипта: щелчок отправляет POST');
  проверить(await п.evaluate(() => document.documentElement.getAttribute('data-theme')) === 'light', 'П3 без скрипта: страница вернулась светлой');
  проверить(await п.locator('header [role="switch"]').first().getAttribute('aria-checked') === 'false', 'П3 без скрипта: бегунок на новом месте');
  await без.close();
}

// П4: рубрика шторки на 390 (разметка рубрик — как у дома с рубриками)
async function рубрика(b) {
  const ctx = await контекст(b, 390);
  const p = await ctx.newPage();
  await p.goto(адрес('единое-меню'), { waitUntil: 'networkidle' });
  await p.locator('.hubmenu__opener .button').click();
  await p.evaluate(() => {
    const s = document.querySelector('#hubmenu .hubmenu__section--screen');
    const r = document.createElement('p');
    r.className = 'hubmenu__rubric';
    r.textContent = 'Доступ';
    s.querySelectorAll(':scope > .button')[1].before(r);
  });
  const вид = await p.evaluate(() => {
    const t = getComputedStyle(document.querySelector('#hubmenu .hubmenu__section--screen .hubmenu__title'));
    const r = getComputedStyle(document.querySelector('#hubmenu .hubmenu__rubric'));
    return { тКегль: parseFloat(t.fontSize), рКегль: parseFloat(r.fontSize) };
  });
  проверить(вид.рКегль < вид.тКегль, `П4: рубрика мельче имени группы (${вид.рКегль} < ${вид.тКегль})`);
  await снимок(p.locator('#hubmenu'), 'шторка-рубрика-390');
  await ctx.close();
}

// П5: пустое состояние с двумя путями
async function пустое(b) {
  for (const ширина of [1280, 390]) {
    const ctx = await контекст(b, ширина);
    const p = await ctx.newPage();
    await p.goto(адрес('пустое-состояние'), { waitUntil: 'networkidle' });
    const ф = образец(p, 'Пустота и карточка рядом');
    await ф.scrollIntoViewIfNeeded();
    const к = await ф.evaluate((f) => {
      const e = f.querySelector('.empty').getBoundingClientRect();
      const c = f.querySelector('.card').getBoundingClientRect();
      const кн = [...f.querySelectorAll('.empty__actions > .button')].map((x) => x.getBoundingClientRect());
      return { зазор: Math.round(c.top - e.bottom), столбиком: кн[1].top > кн[0].bottom - 1, одинШирины: Math.abs(кн[0].width - кн[1].width) < 1 };
    });
    проверить(к.зазор >= 16, `П5 ${ширина}: пустота и карточка не слипаются (${к.зазор} px)`);
    проверить(ширина === 390 ? к.столбиком && к.одинШирины : !к.столбиком, `П5 ${ширина}: пути ${ширина === 390 ? 'столбиком' : 'рядом'}`);
    await снимок(ф, `пустое-два-пути-${ширина}`);
    await ctx.close();
  }
}

// П7: страница входа
async function вход(b) {
  for (const тема of ['светлая', 'тёмная']) {
    for (const ширина of [1280, 390]) {
      for (const скрипт of [true, false]) {
        const ctx = await контекст(b, ширина, скрипт, тема);
        const p = await ctx.newPage();
        await p.goto(адрес('образец-входа'), { waitUntil: 'networkidle' });
        const метка = `П7 ${тема} ${ширина}${скрипт ? '' : ' без скрипта'}`;
        const к = await p.evaluate(() => {
          const n = document.querySelector('.narrow').getBoundingClientRect();
          const h = document.querySelector('header');
          const кн = [...document.querySelectorAll('.narrow .stack > .button')].map((x) => x.getBoundingClientRect());
          return {
            ширина: Math.round(n.width), лево: Math.round(n.left), право: Math.round(window.innerWidth - n.right),
            дороги: h.querySelectorAll('.tree--top').length, тема: h.querySelectorAll('[data-theme-toggle]').length,
            меню: document.querySelectorAll('#hubmenu').length, зазор: Math.round(кн[1].top - кн[0].bottom),
            доРамки: Math.round(document.querySelector('.narrow .note-frame').getBoundingClientRect().top - кн[1].bottom),
            прокрутка: document.documentElement.scrollWidth > window.innerWidth,
          };
        });
        if (ширина === 1280) {
          проверить(к.ширина === 360 && Math.abs(к.лево - к.право) <= 1, `${метка}: колонка 360 по центру (${к.ширина}, ${к.лево}/${к.право})`);
        } else {
          проверить(к.ширина >= 340 && !к.прокрутка, `${метка}: колонка во всю ширину без прокрутки (${к.ширина})`);
        }
        проверить(к.дороги === 0 && к.меню === 0 && к.тема === 1, `${метка}: в шапке только знак и тема`);
        проверить(к.зазор === 8, `${метка}: кнопки провайдеров через 8 px (${к.зазор})`);
        проверить(к.доРамки >= 16, `${метка}: рамочная строка не прилипает к кнопкам (${к.доРамки})`);
        if (тема === 'тёмная') {
          const гитхаб = await p.locator('.stack .button svg.icon--brand').first().evaluate((el) => getComputedStyle(el).fill);
          проверить(гитхаб !== 'rgb(24, 23, 23)', `${метка}: логотип GitHub на тёмной — цветом текста (${гитхаб})`);
        }
        await p.screenshot({ path: path.join(OUT, `вход-${ширина}-${тема === 'светлая' ? 'light' : 'dark'}${скрипт ? '' : '-без-скрипта'}.png`), fullPage: true });
        await ctx.close();
      }
    }
  }
}

(async () => {
  const b = await браузер();
  for (const [имя, шаг] of [['выбор значка', выборЗначка], ['пресеты', пресеты], ['пилюля темы', пилюля],
    ['рубрика шторки', рубрика], ['пустое состояние', пустое], ['страница входа', вход]]) {
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

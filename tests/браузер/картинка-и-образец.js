// Слот картинки и образец выпуска 0.12 на образце сайта документации (/образец-картинки):
// выбор файла отправляет запрос (тихо, multipart) и состояние слота приходит морфингом,
// «Вернуть стандартную» уходит только через подтверждение, ввод в поле меняет текст
// зеркала, поле цвета — свойство CSS, образец в светлой теме на тёмной странице; без
// скрипта — файловое поле с кнопкой отправки и рамка в теме страницы.
// Сайт документации должен быть запущен:
//
//   cd документация && oscript main.os --порт 3463
//   NODE_PATH=/tmp/claude-501/pw/node_modules node tests/браузер/картинка-и-образец.js [адрес] [каталог снимков]
//
// Код выхода 1, если что-то из обещанного не так. Снимки (1280 и 390 px, обе темы) — в каталог
// снимков; в репозиторий их не кладут.

const { chromium } = require('playwright-core');
const { execSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const B = process.argv[2] || 'http://localhost:3463';
const OUT = process.argv[3] || '/tmp/claude-501/снимки-картинки';
const ОБРАЗЕЦ = B + '/' + encodeURIComponent('образец-картинки');
fs.mkdirSync(OUT, { recursive: true });

// файл, который «выбирает» человек: настоящая PNG 1×1
const ФАЙЛ = path.join(os.tmpdir(), 'логотип-проба.png');
fs.writeFileSync(ФАЙЛ, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64'));

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

// Шаг 16: выбор файла отправляет форму слота сразу — запросом в фоне, multipart, с файлом;
// ответ ложится морфингом, и в слоте — имя загруженного файла.
async function загрузка(b) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  const p = await ctx.newPage();
  await p.goto(ОБРАЗЕЦ, { waitUntil: 'networkidle' });
  await пометить(p);

  const поле = await p.locator('#slot-logo .imgslot__file').boundingBox();
  проверить(поле && поле.width <= 1 && поле.height <= 1, '16: со скриптом файловое поле ушло из вида');
  // с клавиатуры: Tab с подписи слота встаёт на скрытое поле, обводку рисует кнопка над ним
  await p.evaluate(() => {
    const п = document.querySelector('#slot-logo .imgslot__label');
    п.tabIndex = -1;
    п.focus();
  });
  await p.keyboard.press('Tab');
  const фокус = await p.evaluate(() => ({
    наПоле: document.activeElement === document.querySelector('#slot-logo .imgslot__file'),
    обводка: getComputedStyle(document.querySelector('#slot-logo .imgslot__face')).outlineStyle,
  }));
  проверить(фокус.наПоле && фокус.обводка !== 'none', '16: Tab встаёт на поле, обводка — у кнопки (' + фокус.обводка + ')');
  проверить(await p.locator('#slot-logo .imgslot__face').isVisible(), '16: видна кнопка «Загрузить»');
  проверить(await p.locator('#slot-logo .imgslot__actions > .button').isVisible() === false,
    '16: кнопка отправки спрятана');
  проверить((await p.locator('#slot-logo .imgslot__face').textContent()).trim() === 'Заменить'
    || (await p.locator('#slot-logo .imgslot__face').textContent()).trim() === 'Загрузить',
    '16: подпись кнопки из словаря');

  const запросы = [];
  p.on('request', (r) => {
    if (r.method() === 'POST') запросы.push(r);
  });
  await p.setInputFiles('#slot-logo .imgslot__file', ФАЙЛ);
  await p.waitForFunction(() => /логотип-проба\.png/.test(
    (document.querySelector('#slot-logo .imgslot__state') || {}).textContent || ''), null, { timeout: 8000 })
    .catch(() => {});

  const пост = запросы[0];
  проверить(!!пост, '16: выбор файла отправил запрос сам');
  if (пост) {
    const тип = (await пост.allHeaders())['content-type'] || '';
    проверить(/multipart\/form-data/.test(тип), '16: запрос — multipart (' + тип.split(';')[0] + ')');
    проверить(пост.resourceType() === 'fetch', '16: запрос в фоне (fetch), не навигация');
    // тело запроса с файлом движок наружу отдаёт не всегда: тогда о файле говорит ответ сервера
    const тело = пост.postDataBuffer() ? пост.postDataBuffer().toString('latin1') : null;
    if (тело !== null) {
      проверить(/name="logo"; filename=/.test(тело), '16: файл ушёл полем logo');
    }
  }
  проверить(await безПерезагрузки(p), '16: страница не перезагружалась');
  const состояние = await p.locator('#slot-logo .imgslot__state').textContent();
  проверить(/логотип-проба\.png · \d+ Б/.test(состояние), '16: состояние пришло с сервера: ' + состояние);
  проверить((await p.locator('#slot-logo .imgslot__face').textContent()).trim() === 'Заменить',
    '16: после загрузки — «Заменить»');
  проверить(await p.locator('#slot-logo .imgslot__gear .menu').count() === 1, '16: появилось меню ⚙');

  // сброс: пункт меню открывает подтверждение, форма без него не уходит
  const доСброса = запросы.length;
  await p.click('#slot-logo .imgslot__gear .menu > .button');
  await p.click('#slot-logo .imgslot__gear .menu__panel button[type=submit]');
  await p.waitForTimeout(300);
  const окно = await p.evaluate(() => {
    const d = document.getElementById('slot-logo-reset');
    return d && { открыто: d.open, модальное: d.matches(':modal') };
  });
  проверить(окно && окно.открыто && окно.модальное, '16: «Вернуть стандартную» открыла подтверждение');
  проверить(запросы.length === доСброса, '16: форма сброса не ушла без подтверждения');
  await p.keyboard.press('Escape');
  await p.waitForTimeout(200);
  проверить(await p.evaluate(() => document.activeElement
    && document.activeElement.matches('#slot-logo .imgslot__gear .menu > .button')),
    '16: закрытое подтверждение вернуло фокус на ⚙');

  await p.click('#slot-logo .imgslot__gear .menu > .button');
  await p.click('#slot-logo .imgslot__gear .menu__panel button[type=submit]');
  await p.click('#slot-logo-reset .modal__actions [name="confirmed"]');
  await p.waitForFunction(() => /Стандартная/.test(
    (document.querySelector('#slot-logo .imgslot__state') || {}).textContent || ''), null, { timeout: 8000 })
    .catch(() => {});
  проверить(/Стандартная/.test(await p.locator('#slot-logo .imgslot__state').textContent()),
    '16: после подтверждения — стандартная');
  проверить(await p.evaluate(() => !document.getElementById('slot-logo-reset')), '16: окна сброса больше нет');
  проверить(await безПерезагрузки(p), '16: сброс прошёл без перезагрузки');
  await ctx.close();
}

// Шаг 17: ввод меняет текст зеркала; цвет — свойство CSS; образец в светлой теме на тёмной
// странице, переключатель — тёмная.
async function зеркало(b) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  const p = await ctx.newPage();
  await p.goto(ОБРАЗЕЦ, { waitUntil: 'networkidle' });
  await p.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });

  await p.fill('#shapka-title', 'Лютик');
  проверить(await p.locator('#obrazec-shapki [data-mirror="title"]').textContent() === 'Лютик',
    '17: ввод в поле поменял текст зеркала');
  await p.fill('#shapka-title', '');
  проверить(await p.locator('#obrazec-shapki [data-mirror="title"]').textContent() === 'Ромашка',
    '17: пустое поле вернуло текст сервера');

  await p.evaluate(() => {
    const поле = document.getElementById('shapka-accent');
    поле.value = '#ff5722';
    поле.dispatchEvent(new Event('input', { bubbles: true }));
  });
  const цвет = await p.evaluate(() => {
    const узел = document.querySelector('#obrazec-shapki [data-mirror="accent"]');
    return { свойство: узел.style.getPropertyValue('--mirror-accent').trim(),
      полоса: getComputedStyle(узел).borderLeftColor };
  });
  проверить(цвет.свойство === '#ff5722', '17: цвет ушёл в свойство --mirror-accent');
  проверить(цвет.полоса === 'rgb(255, 87, 34)', '17: лист сайта взял цвет из свойства: ' + цвет.полоса);

  // акцент — поле вида «цвет»: кружок пишет код в поле кода, зеркало берёт его оттуда;
  // «по умолчанию» снимает свойство
  const зеркалоАкцента = () => p.evaluate(() => document.querySelector('#obrazec-shapki [data-mirror="accent"]')
    .style.getPropertyValue('--mirror-accent').trim());
  await p.locator('#forma-shapki .swatches__item[title="Синий"]').click();
  проверить(await зеркалоАкцента() === '#1a73e8', '17: кружок поля «цвет» перекрасил зеркало');
  await p.locator('#forma-shapki .swatches__item--default').click();
  проверить(await зеркалоАкцента() === '', '17: «по умолчанию» сняло свойство зеркала');

  // тема рамки
  const фон = () => p.evaluate(() => ({
    рамка: getComputedStyle(document.querySelector('#obrazec-shapki .preview__frame')).backgroundColor,
    страница: getComputedStyle(document.body).backgroundColor,
    тема: document.querySelector('#obrazec-shapki .preview__frame').getAttribute('data-theme'),
  }));
  проверить(await p.locator('#obrazec-shapki .preview__themes').isVisible(), '17: переключатель темы виден со скриптом');
  await p.click('#obrazec-shapki [data-preview-theme="light"]');
  const светлая = await фон();
  const яркость = (rgb) => rgb.match(/\d+/g).slice(0, 3).reduce((s, x) => s + Number(x), 0) / 3;
  проверить(светлая.тема === 'light', '17: рамка получила data-theme="light"');
  проверить(яркость(светлая.рамка) > 200 && яркость(светлая.страница) < 60,
    `17: образец в светлой теме на тёмной странице (${светлая.рамка} на ${светлая.страница})`);
  проверить(await p.getAttribute('#obrazec-shapki [data-preview-theme="light"]', 'aria-pressed') === 'true',
    '17: нажата «Светлая» (aria-pressed)');

  await p.evaluate(() => { document.documentElement.dataset.theme = 'light'; });
  await p.click('#obrazec-shapki [data-preview-theme="dark"]');
  const тёмная = await фон();
  проверить(тёмная.тема === 'dark' && яркость(тёмная.рамка) < 60 && яркость(тёмная.страница) > 200,
    `17: образец в тёмной теме на светлой странице (${тёмная.рамка} на ${тёмная.страница})`);
  await p.click('#obrazec-shapki [data-preview-theme="dark"]');
  проверить((await фон()).тема === null, '17: повторное нажатие вернуло рамку к теме страницы');

  // выбор темы переживает тихую отправку формы рядом
  await p.click('#obrazec-shapki [data-preview-theme="light"]');
  await p.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });
  await пометить(p);
  await p.fill('#shapka-title', 'Василёк');
  await p.click('#forma-shapki button[type=submit]');
  await p.waitForFunction(() => /&|\?/.test(location.search) && /Vasil|%D0/.test(location.href), null, { timeout: 8000 })
    .catch(() => {});
  await p.waitForTimeout(300);
  проверить(await безПерезагрузки(p), '17: форма шапки ушла тихо');
  проверить(await p.locator('#obrazec-shapki [data-mirror="title"]').textContent() === 'Василёк',
    '17: сервер напечатал сохранённое название в зеркало');
  проверить((await фон()).тема === 'light', '17: выбор темы образца пережил морфинг');
  await ctx.close();
}

// Без скрипта: файловое поле и кнопка отправки видны, загрузка уходит навигацией; рамка —
// в теме страницы, переключатель спрятан.
// headless-движок без скрипта после отправки формы навигацией перестаёт отдавать кадры
// этой вкладке (снимок и щелчок ждут «стабильности» вечно; в настоящем браузере такого нет) —
// адрес ответа открывается в новой вкладке того же контекста.
async function заново(ctx, p) {
  const адрес = p.url();
  await p.close();
  const новая = await ctx.newPage();
  await новая.goto(адрес, { waitUntil: 'networkidle' });
  return новая;
}

async function безСкрипта(b) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, javaScriptEnabled: false });
  let p = await ctx.newPage();
  await p.goto(ОБРАЗЕЦ, { waitUntil: 'networkidle' });
  проверить(await p.locator('#slot-logo .imgslot__file').isVisible(), 'без скрипта: файловое поле видно');
  проверить(await p.locator('#slot-logo .imgslot__actions > .button').isVisible(), 'без скрипта: кнопка отправки видна');
  проверить(await p.locator('#slot-logo .imgslot__face').isVisible() === false, 'без скрипта: кнопки-подписи нет');
  проверить(await p.locator('#obrazec-shapki .preview__themes').isVisible() === false,
    'без скрипта: переключатель темы спрятан');
  await p.setInputFiles('#slot-logo .imgslot__file', ФАЙЛ);
  await Promise.all([p.waitForNavigation(), p.click('#slot-logo .imgslot__actions > .button')]);
  проверить(/логотип-проба\.png/.test(await p.locator('#slot-logo .imgslot__state').textContent()),
    'без скрипта: файл ушёл кнопкой, сервер вернул состояние');
  p = await заново(ctx, p);

  // сброс без скрипта: сервер печатает подтверждение открытым
  await p.click('#slot-logo .imgslot__gear .menu > .button');
  await Promise.all([p.waitForNavigation(), p.click('#slot-logo .imgslot__gear .menu__panel button[type=submit]')]);
  проверить(await p.evaluate(() => { const d = document.getElementById('slot-logo-reset'); return !!(d && d.open); }),
    'без скрипта: сервер напечатал окно сброса открытым');
  p = await заново(ctx, p);
  await Promise.all([p.waitForNavigation(), p.click('#slot-logo-reset .modal__actions [name="confirmed"]')]);
  проверить(/Стандартная/.test(await p.locator('#slot-logo .imgslot__state').textContent()),
    'без скрипта: подтверждение вернуло стандартную');
  await ctx.close();
}

async function снимки(b) {
  for (const ширина of [1280, 390]) {
    for (const тема of ['dark', 'light']) {
      const ctx = await b.newContext({ viewport: { width: ширина, height: 900 } });
      const p = await ctx.newPage();
      await p.goto(ОБРАЗЕЦ + '?' + encodeURIComponent('файл') + '=logo.png&' + encodeURIComponent('размер') + '=12345',
        { waitUntil: 'networkidle' });
      await p.evaluate((т) => { document.documentElement.dataset.theme = т; }, тема);
      await p.click('#obrazec-shapki [data-preview-theme="' + (тема === 'dark' ? 'light' : 'dark') + '"]');
      await p.waitForTimeout(200);
      const имя = `${ширина}-${тема}`;
      await p.screenshot({ path: path.join(OUT, `картинка-и-образец-${имя}.png`), fullPage: true });
      проверить(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${имя}: без прокрутки вбок`);
      if (ширина === 390) {
        const ряд = await p.evaluate(() => {
          const п = document.querySelector('#slot-logo .imgslot__preview').getBoundingClientRect();
          const к = document.querySelector('#slot-logo .imgslot__face').getBoundingClientRect();
          return { кнопкаНиже: к.top >= п.bottom - 1 };
        });
        проверить(ряд.кнопкаНиже, `${имя}: на телефоне кнопки слота перенеслись под подпись`);
      }
      await ctx.close();
    }
  }
  // страница документации «Слот картинки» и «Образец» собираются и не прокручиваются вбок
  for (const ключ of ['картинка', 'образец']) {
    const ctx = await b.newContext({ viewport: { width: 390, height: 900 } });
    const p = await ctx.newPage();
    const ответ = await p.goto(B + '/' + encodeURIComponent(ключ), { waitUntil: 'networkidle' });
    проверить(ответ.status() === 200, `страница «${ключ}» открывается`);
    проверить(await p.evaluate(() => !document.querySelector('dialog[open]')), `страница «${ключ}»: окон открытых нет`);
    await p.screenshot({ path: path.join(OUT, `страница-${ключ}-390.png`), fullPage: true });
    await ctx.close();
  }
}

(async () => {
  const b = await браузер();
  await загрузка(b);
  await зеркало(b);
  await безСкрипта(b);
  await снимки(b);
  await b.close();
  if (беды.length) { console.error('\nБЕДЫ:\n' + беды.join('\n')); process.exit(1); }
  console.log('ок, снимки в ' + OUT);
})().catch((e) => { console.error(e); process.exit(1); });

// Слова и правки дев-сборки 0.13.0-dev.7 на образцах сайта документации: подпись сегмента на
// телефоне не рвётся посреди слова, окно по адресу без скрипта — в верхнем слое, зеркало
// признаком, панель сегмента вне его набора, запасная кнопка тумблера «сохранять сразу»,
// шапка раскрывашки со значком и плашками. Сайт документации должен быть запущен:
//
//   cd документация && oscript main.os --порт 3391
//   NODE_PATH=/tmp/claude-501/pw/node_modules node tests/браузер/слова-дев-7.js [адрес] [каталог снимков]
//
// Код выхода 1, если что-то из обещанного не так. Снимки — в каталог снимков; в репозиторий
// их не кладут.

const { chromium } = require('playwright-core');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const B = process.argv[2] || process.env.BASE || 'http://localhost:3391';
const OUT = process.argv[3] || '/tmp/claude-501/снимки-слова-дев-7';
const ТОЛЬКО = process.env.ONLY || '';
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

async function страница(b, имя, ширина, скрипт = true, высота = 900) {
  const ctx = await b.newContext({ viewport: { width: ширина, height: высота }, javaScriptEnabled: скрипт });
  const p = await ctx.newPage();
  await p.goto(имя.startsWith('/') ? B + имя : адрес(имя), { waitUntil: 'networkidle' });
  return { ctx, p };
}

// Строки подписи сегмента: слова, на которые браузер её разбил, и число строк. Слово,
// разорванное посреди, даёт строку, которая не кончается концом слова исходной подписи.
function строкиПодписи(span) {
  const текст = span.textContent;
  const узел = span.firstChild;
  const строки = [];
  let верх = null;
  let начало = 0;
  for (let i = 0; i < текст.length; i++) {
    const r = document.createRange();
    r.setStart(узел, i);
    r.setEnd(узел, i + 1);
    const к = r.getClientRects()[0];
    if (!к) continue;
    if (верх === null) верх = к.top;
    if (Math.abs(к.top - верх) > 2) {
      строки.push(текст.slice(начало, i));
      начало = i;
      верх = к.top;
    }
  }
  строки.push(текст.slice(начало));
  return строки.map((с) => с.trim());
}

// Подписи сегментов образца: строки каждой, ширина колонок, вылез ли ряд за пилюлю.
async function замерПодписей(обр) {
  return обр.evaluate((f, тело) => {
    const строкиПодписи = new Function('span', тело);
    const группа = f.querySelector('.segments');
    const г = группа.getBoundingClientRect();
    return {
      вылез: группа.scrollWidth > группа.clientWidth + 1,
      прокрутка: document.documentElement.scrollWidth > window.innerWidth,
      подписи: [...f.querySelectorAll('.segments__text')].map((s) => ({
        текст: s.textContent,
        строки: строкиПодписи(s),
        ширина: Math.round(s.closest('.segments__item').getBoundingClientRect().width),
      })),
      ширина: Math.round(г.width),
    };
  }, строкиПодписи.toString().replace(/^function[^{]*\{|\}$/g, ''));
}

function целыеСлова(п) {
  const слова = п.текст.split(' ');
  return п.строки.every((с) => с.split(' ').every((сл) => слова.includes(сл)));
}

// П. 1: на 390 однословные подписи не рвутся посреди слова, длинная — не больше двух строк.
// Кроме образца во всю ширину — пилюля шириной в тело окна на телефоне (310 px), где в dev.5
// «Вручную» рвалась: колонке в треть пилюли слова не хватало. Чтобы шаг не прошёл даром,
// там же правило dev.5 обязано слово порвать.
async function подписиСегментов(b) {
  for (const скрипт of [true, false]) {
    const { ctx, p } = await страница(b, 'сегменты', 390, скрипт);
    const обр = образец(p, 'Однословные подписи');
    const к = скрипт ? '' : ' без скрипта';
    for (const [где, ширина] of [['во всю ширину', ''], ['в теле окна 310', '310px']]) {
      if (ширина) await обр.evaluate((f, w) => { f.querySelector('.segments').style.maxWidth = w; }, ширина);
      const з = await замерПодписей(обр);
      for (const п of з.подписи) {
        проверить(целыеСлова(п), `сегменты 390${к} ${где}: «${п.текст}» — ни одного разрыва внутри слова (${п.строки.join(' / ')}, колонка ${п.ширина})`);
        проверить(п.строки.length <= 2, `сегменты 390${к} ${где}: «${п.текст}» — не больше двух строк (${п.строки.length})`);
      }
      проверить(!з.вылез, `сегменты 390${к} ${где}: подписи в пилюле (${з.ширина})`);
      проверить(!з.прокрутка, `сегменты 390${к} ${где}: страница не прокручивается вбок`);
      if (скрипт && ширина) await обр.screenshot({ path: path.join(OUT, 'подписи-сегментов-окно-390.png') });
      if (скрипт && !ширина) await обр.screenshot({ path: path.join(OUT, 'подписи-сегментов-390.png') });
    }
    if (скрипт) {
      await p.addStyleTag({ content: '@media (max-width: 600px) { .segments { grid-auto-columns: minmax(0, 1fr) !important; }'
        + ' .segments__text { overflow-wrap: break-word !important; } }' });
      const з = await замерПодписей(обр);
      проверить(з.подписи.some((п) => !целыеСлова(п)),
        `сегменты 390 в теле окна 310: правило dev.5 слово рвало — шаг проверяет то, что надо (${з.подписи.map((п) => п.строки.join(' / ')).join('; ')})`);
      await обр.screenshot({ path: path.join(OUT, 'подписи-сегментов-окно-390-до.png') });
    }
    await ctx.close();
  }
}

// Образец, перенесённый на голую страницу кита: голова (лист и токены темы) та же, что у
// страницы документации, а тело — поле страницы .wrap и разметка образца. Так ширины те же,
// что на странице приложения, а не в рамке образца документации со своими полями.
async function образецНаСтранице(p, подпись) {
  const з = await p.evaluate((подпись) => {
    const f = [...document.querySelectorAll('figure.docs-sample')]
      .find((x) => x.querySelector('.docs-sample__title').textContent.includes(подпись));
    const сцена = f.querySelector('.card, .section').parentElement;
    const голова = [...document.head.querySelectorAll('link[rel="stylesheet"], style')]
      .map((x) => (x.tagName === 'LINK' ? `<link rel="stylesheet" href="${x.href}">` : x.outerHTML)).join('');
    return { голова, тело: сцена.innerHTML, тема: document.documentElement.getAttribute('data-theme') || '' };
  }, подпись);
  await p.setContent(`<!doctype html><html lang="ru" data-theme="${з.тема}"><head><meta charset="utf-8">`
    + `<meta name="viewport" content="width=device-width, initial-scale=1">${з.голова}</head>`
    + `<body><main class="wrap">${з.тело}</main></body></html>`, { waitUntil: 'networkidle' });
  return p.locator('main.wrap');
}

// П. 0: на 390 карточка со списком карточек объектов плоская, а карточки в ней — карточки
// во всю ширину экрана без полей страницы (390 − 2 × 16 = 358). На 1280 — как было.
async function секцияСоСпискомКарточек(b) {
  for (const [ширина, тема] of [[390, 'light'], [390, 'dark'], [1280, 'light']]) {
    const { ctx, p } = await страница(b, 'сетка', ширина);
    await p.evaluate((т) => document.documentElement.setAttribute('data-theme', т), тема);
    const обр = await образецНаСтранице(p, 'Секция со списком карточек');
    const з = await обр.evaluate((f) => {
      const внешняя = f.querySelector('.card');
      const карточки = [...f.querySelectorAll('.objcard')];
      const с = getComputedStyle(внешняя);
      return {
        кольцоВнешней: с.boxShadow,
        заливкаВнешней: с.backgroundColor,
        поляВнешней: [с.paddingLeft, с.paddingRight],
        карточки: карточки.map((к) => {
          const ск = getComputedStyle(к);
          return {
            ширина: Math.round(к.getBoundingClientRect().width),
            кольцо: ск.boxShadow,
            заливка: ск.backgroundColor,
            скругление: ск.borderTopLeftRadius,
            черта: ск.borderTopWidth,
          };
        }),
        прокрутка: document.documentElement.scrollWidth > window.innerWidth,
      };
    });
    const к = `секция со списком ${ширина} ${тема}`;
    проверить(з.карточки.length === 3, `${к}: три карточки (${з.карточки.length})`);
    проверить(з.карточки.every((с) => с.кольцо !== 'none' && с.заливка !== 'rgba(0, 0, 0, 0)'),
      `${к}: у карточек объектов кольцо и заливка (${з.карточки.map((с) => с.заливка).join(', ')})`);
    проверить(з.карточки.every((с) => с.скругление === '16px' && с.черта === '0px'),
      `${к}: скругление 16, без черты (${з.карточки.map((с) => с.скругление + '/' + с.черта).join(', ')})`);
    if (ширина === 390) {
      проверить(з.кольцоВнешней === 'none' && з.заливкаВнешней === 'rgba(0, 0, 0, 0)',
        `${к}: у внешней карточки нет кольца и заливки (${з.кольцоВнешней}; ${з.заливкаВнешней})`);
      проверить(з.поляВнешней.join() === '0px,0px', `${к}: у внешней карточки нет боковых полей (${з.поляВнешней.join(' ')})`);
      проверить(з.карточки.every((с) => с.ширина >= 350),
        `${к}: карточки во всю ширину без полей страницы, ≥ 350 (${з.карточки.map((с) => с.ширина).join(', ')})`);
      проверить(!з.прокрутка, `${к}: страница не прокручивается вбок`);
    } else {
      проверить(з.кольцоВнешней !== 'none', `${к}: на широком экране внешняя карточка — карточка`);
    }
    await обр.screenshot({ path: path.join(OUT, `секция-со-списком-${ширина}-${тема}.png`) });
    await ctx.close();
  }
}

(async () => {
  const b = await браузер();
  const шаги = { секцияСоСпискомКарточек, подписиСегментов };
  try {
    for (const [имя, шаг] of Object.entries(шаги)) {
      if (ТОЛЬКО && !ТОЛЬКО.split(',').includes(имя)) continue;
      await шаг(b);
    }
  } finally {
    await b.close();
  }
  console.log(беды.length ? `\nБЕД: ${беды.length}` : '\nвсё ок');
  process.exit(беды.length ? 1 : 0);
})();

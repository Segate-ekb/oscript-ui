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

(async () => {
  const b = await браузер();
  const шаги = { подписиСегментов };
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

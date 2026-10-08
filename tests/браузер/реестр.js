// Реестр на сайте документации: раскладка записи на 1280 и 390 px в обеих темах, со скриптом
// и без него, плюс снимки свёрнутой и раскрытой записи. Сайт документации должен быть запущен:
//
//   cd документация && oscript main.os --порт 3391
//   NODE_PATH=/tmp/claude-501/pw/node_modules node tests/браузер/реестр.js [адрес] [каталог снимков]
//
// Код выхода 1, если: свёрнутая строка налезает на действия записи; у раскрытой записи видно
// меню ⚙, а у свёрнутой его нет; меню ⚙ не открывается или в нём не те пункты, что внизу
// тела; на узком экране кнопки тела не столбиком во всю ширину; кнопка формы тумблера видна
// при скрипте или спрятана без него; страница уехала вбок.

const { chromium } = require('playwright-core');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const B = process.argv[2] || 'http://localhost:3391';
const OUT = process.argv[3] || '/tmp/claude-501/снимки-реестра';
fs.mkdirSync(OUT, { recursive: true });

function браузер() {
  const кэш = path.join(process.env.HOME, 'Library/Caches/ms-playwright');
  const exe = execSync(`find "${кэш}" -name chrome-headless-shell -type f | head -1`).toString().trim();
  return chromium.launch(exe ? { executablePath: exe } : {});
}

// Замер первого образца страницы: три записи — раскрытая, свёрнутая с меню, из конфигурации.
function замерить() {
  const к = (э) => (э ? э.getBoundingClientRect() : null);
  const видно = (э) => !!э && getComputedStyle(э).display !== 'none' && э.getClientRects().length > 0;
  const образец = document.querySelector('figure.docs-sample:has(.entries)');
  const записи = [...образец.querySelectorAll('.entry')];
  return {
    прокрутка: document.documentElement.scrollWidth > window.innerWidth,
    записи: записи.map((з) => {
      const голова = з.querySelector('.entry__head');
      const действия = з.querySelector('.entry__actions');
      const шестерня = з.querySelector('.entry__gear');
      const кнопки = з.querySelector('.entry__buttons');
      const сохранить = з.querySelector('.entry__actions form:has([data-autosubmit]) .button');
      return {
        открыта: !!з.querySelector('details[open]'),
        голова: к(голова),
        действия: к(действия),
        шестерня: видно(шестерня),
        кнопки: кнопки && видно(кнопки) ? к(кнопки) : null,
        ширинаКнопок: кнопки ? [...кнопки.querySelectorAll('.button')].map((э) => к(э).width) : [],
        направление: кнопки ? getComputedStyle(кнопки).flexDirection : '',
        сохранить: видно(сохранить),
        пунктыМеню: шестерня ? [...шестерня.querySelectorAll('.menu__panel .button span')].map((э) => э.textContent) : [],
        подписиКнопок: кнопки ? [...кнопки.querySelectorAll('.button span')].map((э) => э.textContent) : [],
      };
    }),
  };
}

(async () => {
  const b = await браузер();
  const беды = [];

  for (const скрипт of [true, false]) {
    for (const ширина of [1280, 390]) {
      for (const тема of ['light', 'dark']) {
        const ctx = await b.newContext({ viewport: { width: ширина, height: 900 }, deviceScaleFactor: 1,
          javaScriptEnabled: скрипт });
        const p = await ctx.newPage();
        p.setDefaultTimeout(15000);
        await p.goto(B + '/' + encodeURIComponent('реестр'), { waitUntil: 'networkidle' });
        await p.evaluate((т) => { document.documentElement.dataset.theme = т; }, тема);
        // липкая шапка сайта легла бы поверх снимка образца: на замер она не влияет
        // (стилем узла, а не addStyleTag: без скрипта страницы тот ждёт события загрузки вечно)
        await p.evaluate(() => { const ш = document.querySelector('header.top'); if (ш) ш.style.position = 'static'; });
        const имя = `${ширина}-${тема}${скрипт ? '' : '-без-скрипта'}`;
        const м = await p.evaluate(замерить);

        if (м.прокрутка) беды.push(имя + ': страница уехала вбок');
        м.записи.forEach((з, н) => {
          // свёрнутая строка стоит слева от действий либо, когда места ей не осталось (без
          // скрипта на телефоне), целиком под ними — но не под ними внахлёст
          const под = з.действия && з.голова.top >= з.действия.bottom - 1;
          if (з.действия && !под && з.голова.right > з.действия.left + 1) {
            беды.push(`${имя}: запись ${н + 1} — свёрнутая строка налезает на действия`);
          }
          if (з.действия && !под && (з.действия.top < з.голова.top - 2 || з.действия.bottom > з.голова.bottom + 2)) {
            беды.push(`${имя}: запись ${н + 1} — действия не в свёрнутой строке`);
          }
          if (под && скрипт) беды.push(`${имя}: запись ${н + 1} — при скрипте строке не хватило места рядом с действиями`);
          if (з.открыта && з.шестерня) беды.push(`${имя}: запись ${н + 1} раскрыта, а меню ⚙ видно`);
          if (!з.открыта && з.пунктыМеню.length && !з.шестерня) беды.push(`${имя}: запись ${н + 1} свёрнута, а меню ⚙ нет`);
          if (з.пунктыМеню.length && з.пунктыМеню.join('|') !== з.подписиКнопок.join('|')) {
            беды.push(`${имя}: запись ${н + 1} — пункты меню не те, что кнопки внизу`);
          }
          const тумблер = н < 2;
          if (тумблер && скрипт && з.сохранить) беды.push(`${имя}: запись ${н + 1} — кнопка формы тумблера видна при скрипте`);
          if (тумблер && !скрипт && !з.сохранить) беды.push(`${имя}: запись ${н + 1} — без скрипта тумблер нечем отправить`);
          if (з.кнопки && ширина <= 640) {
            if (з.направление !== 'column') беды.push(`${имя}: запись ${н + 1} — кнопки не столбиком`);
            if (з.ширинаКнопок.some((w) => Math.abs(w - з.кнопки.width) > 2)) беды.push(`${имя}: запись ${н + 1} — кнопки не во всю ширину`);
          }
        });
        if (!м.записи[0].открыта || м.записи[1].открыта) беды.push(имя + ': образец не тот — первая запись должна быть раскрыта, вторая свёрнута');

        const образец = await p.$('figure.docs-sample:has(.entries)');
        await образец.scrollIntoViewIfNeeded();
        await образец.screenshot({ path: path.join(OUT, `реестр-${имя}.png`) });

        if (скрипт) {
          // меню ⚙ свёрнутой записи: браузер открывает панель, в ней те же пункты, что внизу тела
          const вторая = (await p.$$('figure.docs-sample:has(.entries) .entry'))[1];
          await (await вторая.$('.entry__gear .menu > .button')).click();
          await p.waitForTimeout(400);
          const открыто = await вторая.$eval('.menu__panel', (э) => э.matches(':popover-open'));
          if (!открыто) беды.push(имя + ': меню ⚙ не открылось');
          await p.screenshot({ path: path.join(OUT, `реестр-меню-${имя}.png`) });
          await p.keyboard.press('Escape');

          // раскрытие свёрнутой записи прячет её меню ⚙
          await (await вторая.$('summary')).click();
          await p.waitForTimeout(400);
          const шестерня = await вторая.$eval('.entry__gear', (э) => getComputedStyle(э).display);
          if (шестерня !== 'none') беды.push(имя + ': раскрыли запись, а меню ⚙ осталось');
          await вторая.screenshot({ path: path.join(OUT, `реестр-раскрытая-${имя}.png`) });

          const нумерованный = await p.$('figure.docs-sample:has(ol.entries)');
          await нумерованный.scrollIntoViewIfNeeded();
          await нумерованный.screenshot({ path: path.join(OUT, `реестр-нумерованный-${имя}.png`) });
          const пустой = await p.$('figure.docs-sample:has(.empty)');
          await пустой.screenshot({ path: path.join(OUT, `реестр-пустой-${имя}.png`) });
        }

        console.log(имя, JSON.stringify(м.записи.map((з) => ({ голова: Math.round(з.голова.right),
          действия: з.действия ? Math.round(з.действия.left) : null, шестерня: з.шестерня, сохранить: з.сохранить }))));
        await ctx.close();
      }
    }
  }
  await b.close();
  if (беды.length) { console.error(беды.join('\n')); process.exit(1); }
  console.log('ок, снимки в ' + OUT);
})().catch((e) => { console.error(e); process.exit(1); });

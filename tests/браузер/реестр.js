// Реестр на сайте документации: раскладка записи на 1280 и 390 px в обеих темах, со скриптом
// и без него, плюс снимки свёрнутой и раскрытой записи. Сайт документации должен быть запущен:
//
//   cd документация && oscript main.os --порт 3391
//   NODE_PATH=/tmp/claude-501/pw/node_modules node tests/браузер/реестр.js [адрес] [каталог снимков]
//
// Код выхода 1, если: свёрнутая строка налезает на действия записи; у раскрытой записи видно
// меню ⚙, а у свёрнутой его нет; меню ⚙ не открывается или в нём не те пункты, что внизу
// тела; на узком экране кнопки тела не столбиком во всю ширину; кнопка формы тумблера видна
// при скрипте или спрятана без него; страница уехала вбок; окно или подтверждение из тела
// записи стоит внутри свёрнутой записи, а не после списка, и из меню ⚙ открывается невидимым;
// id на странице повторяются.

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

// Окна записи (0.13.0-dev.3): подтверждение и окно правки положены в тело записи, а кит
// печатает их после списка. Из меню ⚙ свёрнутой записи они открываются на виду: модальными
// и не нулевого размера; без скрипта — стоят вне раскрывашки.
async function окнаЗаписи(b, беды) {
  for (const скрипт of [true, false]) {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, javaScriptEnabled: скрипт });
    const p = await ctx.newPage();
    p.setDefaultTimeout(15000);
    await p.goto(B + '/' + encodeURIComponent('реестр'), { waitUntil: 'networkidle' });
    const имя = 'окна записи' + (скрипт ? '' : ', без скрипта');
    const вне = await p.evaluate(() => ['udalit-klyuch-sborka', 'prava-klyuch-sborka'].map((ид) => {
      const д = document.getElementById(ид);
      return !!д && !д.closest('details') && !д.closest('.entries');
    }));
    if (!вне.every(Boolean)) беды.push(имя + ': окно записи стоит внутри списка ' + JSON.stringify(вне));
    // набор кнопок печатается дважды (меню ⚙ и кнопки внизу), а id несёт только пункт меню
    const ids = await p.evaluate(() => {
      const все = [...document.querySelectorAll('[id]')].map((э) => э.id);
      return все.filter((ид, н) => все.indexOf(ид) !== н);
    });
    if (ids.length) беды.push(имя + ': id на странице не уникальны: ' + [...new Set(ids)].join(', '));

    if (скрипт) {
      const запись = p.locator('.entry:has(.entry__gear [data-confirm="udalit-klyuch-sborka"])');
      const виден = (ид) => p.evaluate((ид) => {
        const д = document.getElementById(ид);
        const к = д.getBoundingClientRect();
        const над = document.elementFromPoint(к.left + к.width / 2, к.top + к.height / 2);
        return д.open && д.matches(':modal') && к.width > 100 && к.height > 100 && !!над && д.contains(над);
      }, ид);

      await запись.locator('.entry__gear .menu > .button').click();
      await запись.locator('.menu__panel form[data-confirm] button[type=submit]').click();
      await p.waitForTimeout(300);
      if (!(await виден('udalit-klyuch-sborka'))) беды.push(имя + ': подтверждение из меню ⚙ свёрнутой записи не видно');
      await p.screenshot({ path: path.join(OUT, 'реестр-подтверждение-из-меню.png') });
      await p.keyboard.press('Escape');
      await p.waitForTimeout(100);
      if (await p.evaluate(() => document.getElementById('udalit-klyuch-sborka').open)) беды.push(имя + ': Esc не закрыл подтверждение');

      await p.evaluate(() => { window.__метка = 1; });
      await запись.locator('.entry__gear .menu > .button').click();
      await запись.locator('.menu__panel a[data-opens="prava-klyuch-sborka"]').click();
      await p.waitForTimeout(300);
      if (!(await виден('prava-klyuch-sborka'))) беды.push(имя + ': окно из меню ⚙ свёрнутой записи не видно');
      if (!(await p.evaluate(() => window.__метка === 1))) беды.push(имя + ': ссылка окна увела со страницы');
      const меню = await запись.locator('.menu__panel').evaluate((э) => э.matches(':popover-open'));
      if (меню) беды.push(имя + ': меню ⚙ осталось открытым под окном');
      await p.keyboard.press('Escape');

      // копия набора внизу раскрытой записи — без id: её форма открывает то же подтверждение,
      // а кнопка окна шлёт форму меню (атрибут form)
      await запись.locator('summary').click();
      await запись.locator('.entry__buttons form[data-confirm] button[type=submit]').click();
      await p.waitForTimeout(300);
      if (!(await виден('udalit-klyuch-sborka'))) беды.push(имя + ': подтверждение из кнопок внизу не открылось');
      const связь = await p.evaluate(() => {
        const кнопка = document.querySelector('#udalit-klyuch-sborka [name="confirmed"]');
        return !!кнопка.form && кнопка.form.closest('.entry__gear') !== null;
      });
      if (!связь) беды.push(имя + ': кнопка подтверждения не шлёт форму меню');
      await p.keyboard.press('Escape');
    }
    console.log(имя, 'проверено');
    await ctx.close();
  }
}

(async () => {
  const b = await браузер();
  const беды = [];
  await окнаЗаписи(b, беды);

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

// Слот «Действия» секции и крошки на сайте документации: раскладка на 1280 и 390 px
// в обеих темах плюс снимки образцов. Сайт документации должен быть запущен:
//
//   cd документация && oscript main.os --порт 3391
//   NODE_PATH=/tmp/claude-501/pw/node_modules node tests/браузер/действия-секции.js [адрес] [каталог снимков]
//
// Код выхода 1, если раскладка не та: на широком экране действия не справа от заголовка
// или не по его верху, на узком — не под лидом или кнопка не во всю ширину.

const { chromium } = require('playwright-core');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const B = process.argv[2] || 'http://localhost:3391';
const OUT = process.argv[3] || '/tmp/claude-501/снимки-действий';
fs.mkdirSync(OUT, { recursive: true });

function браузер() {
  const кэш = path.join(process.env.HOME, 'Library/Caches/ms-playwright');
  const exe = execSync(`find "${кэш}" -name chrome-headless-shell -type f | head -1`).toString().trim();
  return chromium.launch(exe ? { executablePath: exe } : {});
}

(async () => {
  const b = await браузер();
  const беды = [];
  for (const ширина of [1280, 390]) {
    for (const тема of ['light', 'dark']) {
      const ctx = await b.newContext({ viewport: { width: ширина, height: 900 }, deviceScaleFactor: 1 });
      const p = await ctx.newPage();
      await p.goto(B + '/' + encodeURIComponent('дом-настроек'), { waitUntil: 'networkidle' });
      await p.evaluate((т) => { document.documentElement.dataset.theme = т; }, тема);

      const замер = await p.evaluate(() => {
        const шапка = document.querySelector('.section__head--actions');
        const к = (э) => э.getBoundingClientRect();
        const заголовок = к(шапка.querySelector('.section__title'));
        const лид = к(шапка.querySelector('.section__lead'));
        const слот = к(шапка.querySelector('.section__actions'));
        const кнопка = к(шапка.querySelector('.section__actions .button'));
        return { заголовок, лид, слот, кнопка, шапка: к(шапка),
          прокрутка: document.documentElement.scrollWidth > window.innerWidth };
      });
      const м = замер;
      const имя = `${ширина}-${тема}`;
      if (ширина > 640) {
        if (!(м.слот.left >= м.заголовок.right - 1)) беды.push(имя + ': действия не справа от заголовка');
        if (Math.abs(м.слот.top - м.заголовок.top) > 2) беды.push(имя + ': действия не по верху заголовка');
      } else {
        if (!(м.слот.top >= м.лид.bottom - 1)) беды.push(имя + ': действия не под лидом');
        if (Math.abs(м.кнопка.width - м.шапка.width) > 2) беды.push(имя + ': кнопка не во всю ширину');
      }
      if (м.прокрутка) беды.push(имя + ': страница уехала вбок');

      const образец = await p.$('figure.docs-sample:has(.section__head--actions)');
      await образец.scrollIntoViewIfNeeded();
      await образец.screenshot({ path: path.join(OUT, `дом-настроек-${имя}.png`) });

      await p.goto(B + '/' + encodeURIComponent('крошки'), { waitUntil: 'networkidle' });
      await p.evaluate((т) => { document.documentElement.dataset.theme = т; }, тема);
      const крошки = await p.$('figure.docs-sample:has(.crumbs)');
      await крошки.screenshot({ path: path.join(OUT, `крошки-${имя}.png`) });
      const текущая = await p.$eval('.docs-sample .crumbs [aria-current="page"]', (э) => ({
        ссылка: !!э.querySelector('a'), текст: э.textContent }));
      if (текущая.ссылка) беды.push(имя + ': у текущей крошки есть ссылка');

      console.log(имя, JSON.stringify({ слот: м.слот, заголовок: м.заголовок, кнопка: м.кнопка.width, шапка: м.шапка.width }));
      await ctx.close();
    }
  }
  await b.close();
  if (беды.length) { console.error(беды.join('\n')); process.exit(1); }
  console.log('ок, снимки в ' + OUT);
})().catch((e) => { console.error(e); process.exit(1); });

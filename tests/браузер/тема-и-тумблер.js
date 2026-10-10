// Браузерный прогон дев-сборки 0.13.0-dev.4 против локального сайта документации: тихая форма
// темы и запасная кнопка тумблера «сохранять сразу».
//
// Тема. Форма с data-theme-toggle перекрашивает страницу на месте и шлёт POST в фоне. Сервер
// приложения отвечает перенаправлением «туда, откуда пришли», а бывает — на главную (адрес
// возврата не дошёл). Ответ ничего не меняет на странице, кроме самого переключателя: адрес,
// история и содержимое остаются. Чтобы проверка не зависела от того, куда ведёт сервер
// документации, ответ на POST подменяется перенаправлением на главную — как у приложения без
// адреса возврата; кука, поставленная сервером, при этом доходит до браузера.
//
// Тумблер. Кнопка-значок «Сохранить» в форме, где единственное поле — тумблер с
// СохранятьСразу, при работающем скрипте спрятана везде, а не только в действиях записи
// реестра; без скрипта она видна — отправить форму больше нечем. Форма, где кроме тумблера
// есть другое поле, свою кнопку показывает и со скриптом.
//
//   cd документация && oscript main.os --порт 3491
//   NODE_PATH=/tmp/claude-501/pw/node_modules BASE=http://localhost:3491 SHOTS=/tmp/снимки \
//     node tests/браузер/тема-и-тумблер.js

const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const АДРЕС = process.env.BASE || 'http://localhost:3333';
const СНИМКИ = process.env.SHOTS || '/tmp/снимки-тема-и-тумблер';
const КУКА = 'oscript_ui_docs';

const страница = (ключ) => АДРЕС + '/' + encodeURIComponent(ключ);
const ошибки = [];
function проверить(условие, текст) {
	if (!условие) ошибки.push(текст);
	console.log((условие ? 'ок   ' : 'БЕДА ') + текст);
}

function браузерныйДвижок() {
	const кэш = path.join(process.env.HOME, 'Library/Caches/ms-playwright');
	const найдено = execSync(`find "${кэш}" -name chrome-headless-shell -type f | head -1`).toString().trim();
	return найдено || undefined;
}

// Образец «Тумблер в своей форме» страницы «Тумблер».
const ТУМБЛЕР = '.docs-sample__preview form:has(.toggle__input[data-autosubmit])';

(async () => {
	fs.mkdirSync(СНИМКИ, { recursive: true });
	const браузер = await chromium.launch({ executablePath: браузерныйДвижок() });

	// --- тема: щелчок перекрашивает страницу и не уводит с неё ----------------------------------
	for (const ширина of [1280, 390]) {
		const контекст = await браузер.newContext({ viewport: { width: ширина, height: ширина > 500 ? 900 : 844 } });
		await контекст.addCookies([{ name: КУКА, value: encodeURIComponent('тема=тёмная'), url: АДРЕС }]);
		const p = await контекст.newPage();
		let запросов = 0;
		await p.route('**/*', async (route) => {
			const запрос = route.request();
			if (запрос.method() !== 'POST' || !decodeURIComponent(запрос.url()).includes('/вид/тема')) {
				return route.continue();
			}
			запросов++;
			const ответ = await route.fetch({ maxRedirects: 0 });
			const заголовки = { location: '/' };
			const кука = ответ.headers()['set-cookie'];
			if (кука) заголовки['set-cookie'] = кука;
			return route.fulfill({ status: 303, headers: заголовки, body: '' });
		});

		await p.goto(страница('карточка'), { waitUntil: 'networkidle' });
		await p.evaluate(() => window.scrollTo(0, 400));
		const до = await p.evaluate(() => ({
			адрес: location.href,
			тема: document.documentElement.getAttribute('data-theme'),
			история: history.length,
			заголовок: document.querySelector('h1') && document.querySelector('h1').textContent,
			подсказка: document.querySelector('form[data-theme-toggle] .button').getAttribute('title'),
		}));

		// на телефоне переключатель живёт в панели меню; на широком — в шапке
		if (ширина < 900) {
			await p.locator('.hubmenu__opener .button').click();
			await p.locator('#hubmenu form[data-theme-toggle] .button').click();
		} else {
			await p.locator('.top form[data-theme-toggle] .button').first().click();
		}
		await p.waitForFunction(() => !document.querySelector('form[data-theme-toggle][aria-busy]'));
		await p.waitForTimeout(400);

		const после = await p.evaluate(() => ({
			адрес: location.href,
			тема: document.documentElement.getAttribute('data-theme'),
			история: history.length,
			заголовок: document.querySelector('h1') && document.querySelector('h1').textContent,
			прокрутка: window.scrollY,
			подсказка: document.querySelector('form[data-theme-toggle] .button').getAttribute('title'),
		}));
		проверить(запросов === 1, `${ширина}: форма темы ушла на сервер в фоне один раз (${запросов})`);
		проверить(до.тема !== после.тема && после.тема === 'light', `${ширина}: data-theme перевернулся (${до.тема} → ${после.тема})`);
		проверить(после.адрес === до.адрес, `${ширина}: адрес страницы прежний при ответе-перенаправлении на главную (${после.адрес})`);
		проверить(после.история === до.история, `${ширина}: история вкладки не выросла (${до.история} → ${после.история})`);
		проверить(после.заголовок === до.заголовок, `${ширина}: содержимое страницы не подменено главной («${после.заголовок}»)`);
		if (ширина >= 900) {
			проверить(после.прокрутка > 0, `${ширина}: прокрутка на месте (${после.прокрутка})`);
		}
		проверить(после.подсказка !== до.подсказка, `${ширина}: подсказка переключателя взята из ответа («${до.подсказка}» → «${после.подсказка}»)`);
		const кука = (await контекст.cookies()).find((к) => к.name === КУКА);
		проверить(кука && decodeURIComponent(кука.value).includes('светлая'), `${ширина}: кука темы поставлена ответом (${кука && decodeURIComponent(кука.value)})`);

		// второй щелчок возвращает тему и тоже не уходит
		if (ширина >= 900) {
			await p.locator('.top form[data-theme-toggle] .button').first().click();
			await p.waitForFunction(() => !document.querySelector('form[data-theme-toggle][aria-busy]'));
			await p.waitForTimeout(400);
			const ещё = await p.evaluate(() => ({ адрес: location.href, тема: document.documentElement.getAttribute('data-theme') }));
			проверить(ещё.тема === 'dark' && ещё.адрес === до.адрес, `${ширина}: второй щелчок — снова тёмная, адрес прежний`);
		}
		await контекст.close();
	}

	// --- тумблер «сохранять сразу»: запасная кнопка ---------------------------------------------
	for (const сокрипт of [true, false]) {
		for (const [тема, значение] of [['светлая', 'тема=светлая'], ['тёмная', 'тема=тёмная']]) {
			const контекст = await браузер.newContext({ viewport: { width: 1280, height: 900 }, javaScriptEnabled: сокрипт });
			await контекст.addCookies([{ name: КУКА, value: encodeURIComponent(значение), url: АДРЕС }]);
			const p = await контекст.newPage();
			const метка = `${тема}${сокрипт ? '' : '-без-js'}`;
			await p.goto(страница('тумблер'), { waitUntil: 'networkidle' });

			const форма = p.locator(ТУМБЛЕР).filter({ hasNot: p.locator('.field') }).first();
			проверить(await форма.count() === 1, `${метка}: на странице «Тумблер» есть форма с одним тумблером СохранятьСразу`);
			const видна = await форма.locator('button.button[type="submit"]').isVisible();
			проверить(видна === !сокрипт, `${метка}: кнопка «Сохранить» ${сокрипт ? 'спрятана' : 'видна'} (видна: ${видна})`);
			await форма.scrollIntoViewIfNeeded();
			await форма.screenshot({ path: path.join(СНИМКИ, `тумблер-сразу-${метка}.png`) });

			// форма, где кроме тумблера есть другое поле: кнопка — единственный способ отправить
			// это поле, лист её не прячет; форма собирается копией образца с добавленным полем
			const своя = await p.evaluate(() => {
				const образец = document.querySelector('.docs-sample__preview form:has(.toggle__input[data-autosubmit]):has(button.button[type="submit"]:not(.toggle__save))');
				const копия = образец.cloneNode(true);
				const поле = document.createElement('input');
				поле.type = 'text';
				поле.name = 'описание';
				копия.prepend(поле);
				образец.after(копия);
				const кнопка = копия.querySelector('button.button[type="submit"]');
				const видна = getComputedStyle(кнопка).display !== 'none';
				копия.remove();
				return видна;
			});
			проверить(своя, `${метка}: форма с тумблером и другим полем кнопку показывает`);

			// сегменты с СохранятьСразу — правило про тумблер их кнопку не трогает
			await p.goto(страница('сегменты'), { waitUntil: 'networkidle' });
			const сегменты = p.locator('.docs-sample__preview form:has(.segments [data-autosubmit]) button.button[type="submit"]').first();
			проверить(await сегменты.count() === 1 && await сегменты.isVisible(), `${метка}: у формы сегментов кнопка на месте`);

			// запись реестра — прежнее правило не сломано
			await p.goto(страница('реестр'), { waitUntil: 'networkidle' });
			const вЗаписи = p.locator('.entry__actions form:has([data-autosubmit]) .button').first();
			if (await вЗаписи.count()) {
				const видимая = await вЗаписи.isVisible();
				проверить(видимая === !сокрипт, `${метка}: в действиях записи реестра кнопка ${сокрипт ? 'спрятана' : 'видна'}`);
			}
			await контекст.close();
		}
	}

	await браузер.close();
	if (ошибки.length) {
		console.log(`\n${ошибки.length} проверок не прошли`);
		process.exit(1);
	}
	console.log('\nвсе проверки прошли');
})().catch((e) => { console.error(e); process.exit(1); });

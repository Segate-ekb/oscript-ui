// Браузерный прогон шагов 21 и 22 выпуска 0.13 против локального сайта документации:
// таблица карточками и свойства. Обоим скрипт кита не нужен, поэтому главное проверяется
// БЕЗ скрипта: на телефоне запись-карточка начинается с заглавной ячейки (крупнее соседей),
// меню строки стоит в правом верхнем углу карточки, а его лист выезжает у нижнего края окна;
// на широком экране ячейки стоят в ряд, как прежде. Секрет свойства закрыт точками, щелчок
// и пробел по «Показать» открывают значение листом; до 640px имя свойства стоит над
// значением. Со скриптом сайта кнопка копирования кладёт в буфер текст значения. Снимки
// 1280 и 390 px в обеих темах кладутся в каталог SHOTS (не в репозиторий).
//
//   cd документация && oscript main.os --порт 3471
//   NODE_PATH=/tmp/claude-501/pw/node_modules BASE=http://localhost:3471 SHOTS=/tmp/снимки \
//     node tests/браузер/карточки-и-свойства.js

const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const АДРЕС = process.env.BASE || 'http://localhost:3333';
const СНИМКИ = process.env.SHOTS || '/tmp/снимки-карточки';
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

// Таблица карточками образца «Заглавная колонка и меню строки»: рамки первой записи.
const ТАБЛИЦА = '.docs-sample:has(.table-cards .cell-title):has(.cell-menu) table';
async function карточка(p) {
	return p.evaluate((селектор) => {
		const таблица = document.querySelector(селектор);
		const запись = таблица.querySelector('tbody tr');
		const рамка = (у) => { const r = у.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom }; };
		const ячейки = [...запись.children].filter((у) => у.getClientRects().length > 0);
		const заглавная = запись.querySelector('.cell-title');
		const меню = запись.querySelector('.cell-menu');
		const прочие = ячейки.filter((у) => у !== заглавная && у !== меню);
		return {
			запись: рамка(запись),
			заглавная: рамка(заглавная),
			меню: рамка(меню),
			кнопкаМеню: рамка(меню.querySelector('button')),
			прочие: прочие.map(рамка),
			шрифтЗаглавной: parseFloat(getComputedStyle(заглавная).fontSize),
			шрифтПрочей: parseFloat(getComputedStyle(прочие[0]).fontSize),
			подписьЗаглавной: заглавная.getAttribute('data-label'),
		};
	}, ТАБЛИЦА);
}

// Свойство-секрет образца «Копируемое, секрет и примечание»: видно ли значение и точки.
const СЕКРЕТ = '.docs-sample .props__value--secret';
async function секрет(p) {
	return p.evaluate((селектор) => {
		const dd = document.querySelector(селектор);
		const видно = (у) => у.getClientRects().length > 0;
		return {
			значение: видно(dd.querySelector('.props__text')),
			точки: видно(dd.querySelector('.props__mask')),
			подпись: dd.querySelector('.props__reveal').innerText.trim(),
			отмечена: dd.querySelector('.props__reveal-box').checked,
		};
	}, СЕКРЕТ);
}

(async () => {
	fs.mkdirSync(СНИМКИ, { recursive: true });
	const браузер = await chromium.launch({ executablePath: браузерныйДвижок() });

	// --- таблица карточками без скрипта ------------------------------------------------------
	for (const ширина of [390, 1280]) {
		const контекст = await браузер.newContext({
			viewport: { width: ширина, height: ширина > 500 ? 900 : 844 }, javaScriptEnabled: false,
		});
		const p = await контекст.newPage();
		await p.goto(страница('таблица'), { waitUntil: 'networkidle' });
		await p.locator(ТАБЛИЦА).scrollIntoViewIfNeeded();
		const к = await карточка(p);

		if (ширина === 390) {
			проверить(к.прочие.every((я) => я.t >= к.заглавная.b - 1),
				'390: заглавная ячейка — первой строкой карточки, остальные под ней');
			проверить(к.шрифтЗаглавной > к.шрифтПрочей,
				`390: заглавная крупнее соседей (${к.шрифтЗаглавной} > ${к.шрифтПрочей})`);
			проверить(к.подписьЗаглавной === null, '390: у заглавной нет подписи колонки');
			проверить(Math.abs(к.меню.t - к.заглавная.t) < 24 && к.меню.l > к.заглавная.l,
				'390: меню строки — в той же первой строке, справа от заглавной');
			проверить(к.запись.r - к.кнопкаМеню.r < 16,
				`390: кнопка меню у правого края карточки (зазор ${Math.round(к.запись.r - к.кнопкаМеню.r)}px)`);
			проверить(к.кнопкаМеню.t - к.запись.t < 16,
				`390: и у верхнего (зазор ${Math.round(к.кнопкаМеню.t - к.запись.t)}px)`);

			// лист действий — у нижнего края окна, как прежде (popover работает без скрипта)
			await p.locator(ТАБЛИЦА + ' tbody tr .cell-menu button').first().click();
			await p.waitForTimeout(500);
			const лист = await p.evaluate(() => {
				const панель = document.querySelector('.menu__panel:popover-open');
				if (!панель) return null;
				const r = панель.getBoundingClientRect();
				return { низ: r.bottom, окно: window.innerHeight };
			});
			проверить(лист && Math.abs(лист.низ - лист.окно) < 2, '390: лист меню выехал у нижнего края окна');
			await p.screenshot({ path: path.join(СНИМКИ, 'карточки-лист-меню-390.png') });
			await p.keyboard.press('Escape');
		} else {
			проверить(к.прочие.every((я) => Math.abs(я.t - к.заглавная.t) < 2) && Math.abs(к.меню.t - к.заглавная.t) < 2,
				'1280: ячейки записи стоят в ряд, как прежде');
			проверить(к.прочие[0].r <= к.заглавная.l + 1,
				'1280: заглавная остаётся на месте своей колонки');
		}
		проверить(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
			`${ширина}: страница таблицы без горизонтальной прокрутки`);
		await контекст.close();
	}

	// --- свойства без скрипта ---------------------------------------------------------------
	for (const ширина of [390, 1280]) {
		const контекст = await браузер.newContext({
			viewport: { width: ширина, height: ширина > 500 ? 900 : 844 }, javaScriptEnabled: false,
		});
		const p = await контекст.newPage();
		await p.goto(страница('списки'), { waitUntil: 'networkidle' });
		await p.locator(СЕКРЕТ).first().scrollIntoViewIfNeeded();

		let с = await секрет(p);
		проверить(!с.значение && с.точки && с.подпись === 'Показать',
			`${ширина}: секрет закрыт точками, рядом «Показать»`);
		await p.locator(СЕКРЕТ + ' .props__reveal').first().click();
		с = await секрет(p);
		проверить(с.значение && !с.точки && с.подпись === 'Скрыть',
			`${ширина}: щелчок по «Показать» открывает значение без скрипта`);

		// с клавиатуры: фокус в спрятанной галке, пробел закрывает значение обратно
		await p.locator(СЕКРЕТ + ' .props__reveal-box').first().focus();
		await p.keyboard.press('Space');
		с = await секрет(p);
		проверить(!с.значение && с.точки && !с.отмечена, `${ширина}: пробел на галке снова прячет значение`);
		const кольцо = await p.evaluate((селектор) =>
			getComputedStyle(document.querySelector(селектор + ' .props__reveal')).outlineStyle, СЕКРЕТ);
		проверить(кольцо !== 'none', `${ширина}: фокус на галке виден кольцом на «Показать»`);

		const пара = await p.evaluate(() => {
			const dl = document.querySelector('.docs-sample .props:has(.props__copy)');
			const dt = dl.querySelector('dt');
			const dd = dl.querySelector('dd');
			const a = dt.getBoundingClientRect();
			const b = dd.getBoundingClientRect();
			const кнопка = dd.querySelector('.props__copy').getBoundingClientRect();
			const значение = dd.querySelector('.props__text').getBoundingClientRect();
			return { dt: { l: a.left, b: a.bottom, t: a.top }, dd: { l: b.left, t: b.top }, кнопка: кнопка.left, значение: значение.right };
		});
		if (ширина === 390) {
			проверить(пара.dt.b <= пара.dd.t + 1 && Math.abs(пара.dt.l - пара.dd.l) < 2,
				'390: имя свойства над значением, одна колонка');
		} else {
			проверить(Math.abs(пара.dt.t - пара.dd.t) < 4 && пара.dd.l > пара.dt.l,
				'1280: имя и значение в одной строке');
		}
		проверить(пара.кнопка - пара.значение < 24, `${ширина}: кнопка копирования сразу за значением`);
		проверить(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
			`${ширина}: страница свойств без горизонтальной прокрутки`);
		await контекст.close();
	}

	// --- копирование со скриптом сайта ------------------------------------------------------------
	{
		const контекст = await браузер.newContext({ viewport: { width: 1280, height: 900 } });
		await контекст.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: АДРЕС });
		const p = await контекст.newPage();
		await p.goto(страница('списки'), { waitUntil: 'networkidle' });
		const кнопка = p.locator('.docs-sample__preview .props__copy').first();
		const ждём = await кнопка.getAttribute('data-copy');
		await кнопка.click();
		await p.waitForTimeout(300);
		const буфер = await p.evaluate(() => navigator.clipboard.readText());
		проверить(буфер === ждём && ждём.startsWith('https://'), `копирование кладёт в буфер текст значения (${буфер})`);
		await контекст.close();
	}

	// --- снимки 1280 и 390 в обеих темах ---------------------------------------------------------
	for (const [тема, значение] of [['светлая', 'тема=светлая'], ['тёмная', 'тема=тёмная']]) {
		for (const ширина of [1280, 390]) {
			const контекст = await браузер.newContext({ viewport: { width: ширина, height: ширина > 500 ? 900 : 844 } });
			await контекст.addCookies([{ name: КУКА, value: encodeURIComponent(значение), url: АДРЕС }]);
			const p = await контекст.newPage();
			const метка = `${ширина}-${тема}`;

			await p.goto(страница('таблица'), { waitUntil: 'networkidle' });
			const образец = p.locator('.docs-sample:has(.table-cards .cell-menu) .docs-sample__preview').first();
			await образец.scrollIntoViewIfNeeded();
			await образец.screenshot({ path: path.join(СНИМКИ, `карточки-${метка}.png`) });

			await p.goto(страница('списки'), { waitUntil: 'networkidle' });
			const свойства = p.locator('.docs-sample:has(.props__value--secret) .docs-sample__preview').first();
			await свойства.scrollIntoViewIfNeeded();
			await свойства.screenshot({ path: path.join(СНИМКИ, `свойства-${метка}.png`) });
			await свойства.locator('.props__reveal').first().click();
			await свойства.screenshot({ path: path.join(СНИМКИ, `свойства-открыт-${метка}.png`) });
			const дерево = p.locator('.docs-sample:has(.meter) .docs-sample__preview').first();
			await дерево.scrollIntoViewIfNeeded();
			await дерево.screenshot({ path: path.join(СНИМКИ, `свойства-дерево-${метка}.png`) });
			await контекст.close();
		}
	}

	await браузер.close();
	console.log(ошибки.length ? `\nБЕД: ${ошибки.length}` : '\nвсё в порядке');
	process.exit(ошибки.length ? 1 : 0);
})();

// Браузерный прогон шага 10 выпуска 0.11 против локального сайта документации: шаги
// длинной формы. Со скриптом — одна панель за раз, «Дальше» не пускает с пустым
// обязательным полем (reportValidity), Enter — тот же «Дальше», щелчок по полосе вперёд
// проверяет шаги по дороге, форма с отказом сервера начинает с шага отказа, вид «вкладки»
// открывает вкладку с негодным полем при отправке. Без скрипта — панели подряд, первая
// открыта, кнопка отправки видна. Снимки 1280 и 390 px в обеих темах кладутся в каталог
// SHOTS (не в репозиторий).
//
//   cd документация && oscript main.os --порт 3397
//   NODE_PATH=/tmp/claude-501/pw/node_modules BASE=http://localhost:3397 SHOTS=/tmp/снимки \
//     node tests/браузер/шаги.js

const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const АДРЕС = process.env.BASE || 'http://localhost:3333';
const СНИМКИ = process.env.SHOTS || '/tmp/снимки-шаги';
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

// Состояние образца номер N (с нуля) на странице: какая панель видна, что в полосе, что
// в ряду кнопок, где фокус.
async function состояние(p, номер) {
	return p.evaluate((н) => {
		const корень = document.querySelectorAll('[data-steps]')[н];
		const панели = [...корень.querySelectorAll(':scope > [data-steps-panel]')];
		const пункты = [...корень.querySelectorAll(':scope > [data-steps-bar] > li')];
		const видна = (у) => у && у.getClientRects().length > 0 && getComputedStyle(у).visibility !== 'hidden';
		const кнопка = (имя) => корень.querySelector(':scope > .steps__nav > [' + имя + ']');
		const активный = document.activeElement;
		return {
			живые: корень.hasAttribute('data-steps-live'),
			полоса: видна(корень.querySelector(':scope > [data-steps-bar]')),
			видимые: панели.map((п, i) => (видна(п) ? i : -1)).filter((i) => i >= 0),
			открытые: панели.map((п, i) => (п.open ? i : -1)).filter((i) => i >= 0),
			текущий: пункты.findIndex((п) => п.getAttribute('aria-current') === 'step'),
			пройдены: пункты.map((п, i) => (п.hasAttribute('data-steps-done') ? i : -1)).filter((i) => i >= 0),
			назад: видна(кнопка('data-steps-back')),
			дальше: видна(кнопка('data-steps-next')),
			отправка: видна(кнопка('data-steps-submit')),
			фокус: активный ? (активный.name || активный.getAttribute('aria-label') || активный.tagName) : '',
		};
	}, номер);
}

const корень = (p, н) => p.locator('[data-steps]').nth(н);

(async () => {
	fs.mkdirSync(СНИМКИ, { recursive: true });
	const браузер = await chromium.launch({ executablePath: браузерныйДвижок() });

	// --- со скриптом: поведение -----------------------------------------------------------
	{
		const контекст = await браузер.newContext({ viewport: { width: 1280, height: 900 } });
		const p = await контекст.newPage();
		await p.goto(страница('шаги'), { waitUntil: 'networkidle' });
		const м = корень(p, 0);
		await м.scrollIntoViewIfNeeded();

		let с = await состояние(p, 0);
		проверить(с.живые && с.полоса, 'скрипт оживил шаги: полоса видна');
		проверить(JSON.stringify(с.видимые) === '[0]', 'видна одна первая панель: ' + с.видимые);
		проверить(с.текущий === 0 && !с.назад && с.дальше && !с.отправка,
			'на первом шаге: «Дальше» есть, «Назад» и отправки нет');

		// «Дальше» с пустым обязательным полем
		await м.locator('[data-steps-next] button').click();
		с = await состояние(p, 0);
		const годно = await м.locator('input[name="name"]').evaluate((у) => у.validity.valid);
		проверить(JSON.stringify(с.видимые) === '[0]' && с.текущий === 0,
			'«Дальше» не пускает с пустым обязательным полем');
		проверить(с.фокус === 'name' && !годно, 'фокус на негодном поле, отказ браузера: ' + с.фокус);

		// Enter в пустом поле — тот же «Дальше», форма не уходит
		const адрес = p.url();
		await м.locator('input[name="name"]').press('Enter');
		с = await состояние(p, 0);
		проверить(p.url() === адрес && с.текущий === 0, 'Enter в пустом поле: шаг тот же, форма не ушла');

		// заполнили — «Дальше» пускает
		await м.locator('input[name="name"]').fill('alpha');
		await м.locator('[data-steps-next] button').click();
		с = await состояние(p, 0);
		проверить(JSON.stringify(с.видимые) === '[1]' && с.текущий === 1, 'заполненный шаг пускает дальше');
		проверить(JSON.stringify(с.пройдены) === '[0]', 'первый шаг отмечен пройденным');
		проверить(с.назад && с.дальше && !с.отправка, 'на втором шаге «Назад» и «Дальше»');
		проверить(с.фокус === 'Шаг 2 из 3: Участники', 'фокус на панели нового шага: ' + с.фокус);
		await м.screenshot({ path: path.join(СНИМКИ, 'шаги-второй-1280-светлая.png') });

		// щелчок по полосе вперёд проверяет шаг по дороге
		await м.locator('[data-steps-go="3"]').click();
		с = await состояние(p, 0);
		проверить(с.текущий === 1 && с.фокус === 'owner', 'прыжок на третий остановлен на пустом владельце');

		// неверная почта — тоже отказ
		await м.locator('input[name="owner"]').fill('anna@');
		await м.locator('input[name="owner"]').press('Enter');
		с = await состояние(p, 0);
		проверить(с.текущий === 1, 'неверная почта не пускает дальше');

		await м.locator('input[name="owner"]').fill('anna@example.com');
		await м.locator('input[name="owner"]').press('Enter');
		с = await состояние(p, 0);
		проверить(с.текущий === 2 && !с.дальше && с.отправка && с.назад,
			'Enter с годной почтой — последний шаг: «Дальше» уступил отправке');
		проверить(JSON.stringify(с.пройдены) === '[0,1]', 'пройдены два шага: ' + с.пройдены);

		// назад и щелчок по пройденному
		await м.locator('[data-steps-back] button').click();
		с = await состояние(p, 0);
		проверить(с.текущий === 1, '«Назад» — на второй шаг');
		await м.locator('[data-steps-go="1"]').click();
		с = await состояние(p, 0);
		проверить(с.текущий === 0 && с.пройдены.length === 0, 'щелчок по пройденному — на первый шаг');
		проверить(await м.locator('input[name="owner"]').inputValue() === 'anna@example.com',
			'введённое на других шагах сохранилось');

		// образец с отказом сервера начинает со второго шага
		с = await состояние(p, 1);
		проверить(с.текущий === 1 && JSON.stringify(с.видимые) === '[1]', 'форма с отказом открыта на шаге отказа');

		// вид «вкладки»: отправка видна всегда, негодное поле на другой вкладке открывает её
		const в = корень(p, 2);
		await в.scrollIntoViewIfNeeded();
		с = await состояние(p, 2);
		проверить(!с.назад && !с.дальше && с.отправка, 'вкладки: без «Назад / Дальше», отправка видна');
		await в.locator('input[name="name"]').fill('');
		await в.locator('[data-steps-go="3"]').click();
		с = await состояние(p, 2);
		проверить(с.текущий === 2 && с.пройдены.length === 0, 'вкладки: любой шаг открывается сразу');
		const адресВкладок = p.url();
		await в.locator('[data-steps-submit] button').click();
		await p.waitForTimeout(200);
		с = await состояние(p, 2);
		проверить(p.url() === адресВкладок && с.текущий === 0 && с.фокус === 'name',
			'вкладки: отправка с пустым полем открыла его вкладку и показала отказ');
		await контекст.close();
	}

	// --- меньше движения: всё то же, без плавной прокрутки ----------------------------------
	{
		const контекст = await браузер.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
		const p = await контекст.newPage();
		await p.goto(страница('шаги'), { waitUntil: 'networkidle' });
		const м = корень(p, 0);
		await м.locator('input[name="name"]').fill('alpha');
		await м.locator('[data-steps-next] button').click();
		const с = await состояние(p, 0);
		проверить(с.текущий === 1, 'меньше движения: шаги переключаются');
		const подписи = await м.evaluate((к) => [...к.querySelectorAll('.steps__label')]
			.map((у) => у.getBoundingClientRect().width > 1));
		проверить(JSON.stringify(подписи) === '[false,true,false]', 'до 640 px видна только подпись текущего: ' + подписи);
		await контекст.close();
	}

	// --- без скрипта: панели подряд ---------------------------------------------------------
	{
		const контекст = await браузер.newContext({ viewport: { width: 1280, height: 900 }, javaScriptEnabled: false });
		const p = await контекст.newPage();
		await p.goto(страница('шаги'), { waitUntil: 'networkidle' });
		const с = await состояние(p, 0);
		проверить(!с.живые && !с.полоса, 'без скрипта полосы нет');
		проверить(JSON.stringify(с.видимые) === '[0,1,2]' && JSON.stringify(с.открытые) === '[0]',
			'без скрипта панели подряд, открыта первая');
		проверить(!с.назад && !с.дальше && с.отправка, 'без скрипта видна только отправка');
		const отказ = await состояние(p, 1);
		проверить(JSON.stringify(отказ.открытые) === '[1]', 'без скрипта форма с отказом открыта на шаге отказа');

		// обязательное поле в свёрнутой панели: отказ браузеру показать негде, отправка
		// не идёт — шапка панели с таким полем берёт цвет ошибки
		const м = корень(p, 0);
		await м.locator('input[name="name"]').fill('alpha');
		const адрес = p.url();
		await м.locator('[data-steps-submit] button').click();
		await p.waitForTimeout(300);
		const цвета = await м.evaluate((к) => [...к.querySelectorAll(':scope > [data-steps-panel] > summary')]
			.map((у) => getComputedStyle(у).color));
		console.log('     справка: адрес ' + (p.url() === адрес ? 'тот же' : 'сменился') + ', цвета шапок ' + цвета.join(' | '));
		проверить(p.url() === адрес && цвета[1] !== цвета[0] && цвета[2] === цвета[0],
			'без скрипта шапка панели с негодным полем после попытки отправки — цвета ошибки');
		await контекст.close();
	}

	// --- снимки 1280 и 390 в обеих темах ---------------------------------------------------
	for (const сокрипт of [true, false]) {
		for (const [тема, значение] of [['светлая', 'тема=светлая'], ['тёмная', 'тема=тёмная']]) {
			for (const ширина of [1280, 390]) {
				const контекст = await браузер.newContext({
					viewport: { width: ширина, height: ширина > 500 ? 900 : 844 },
					javaScriptEnabled: сокрипт,
				});
				await контекст.addCookies([{ name: КУКА, value: encodeURIComponent(значение), url: АДРЕС }]);
				const p = await контекст.newPage();
				await p.goto(страница('шаги'), { waitUntil: 'networkidle' });
				const метка = `${ширина}-${тема}${сокрипт ? '' : '-без-js'}`;
				for (const [н, имя] of [[0, 'мастер'], [2, 'вкладки']]) {
					const к = корень(p, н);
					await к.scrollIntoViewIfNeeded();
					if (сокрипт && н === 0) {
						await к.locator('input[name="name"]').fill('alpha');
						await к.locator('[data-steps-next] button').click();
						await к.locator('input[name="owner"]').blur();
					}
					await p.waitForTimeout(600); // переходы и рябь догорают
					await к.screenshot({ path: path.join(СНИМКИ, `шаги-${имя}-${метка}.png`) });
				}
				const поля = await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
				проверить(поля, `${метка}: страница без горизонтальной прокрутки`);
				await контекст.close();
			}
		}
	}

	await браузер.close();
	console.log(ошибки.length ? `\nБЕД: ${ошибки.length}` : '\nвсё в порядке');
	process.exit(ошибки.length ? 1 : 0);
})();

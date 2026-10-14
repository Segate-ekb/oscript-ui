// Браузерный прогон шагов 14 и 15 выпуска 0.12 против локального сайта документации: поле-
// список и поле цвета на странице «Поле». Список со скриптом — плашки из строки сервера,
// Enter и запятая добавляют плашку, повтор не добавляется, крестик и Backspace снимают,
// уход из строки делает плашку из набранного, форма отдаёт ОДНУ строку через запятую под
// именем поля. Цвет со скриптом — ряд образцов виден, кружок пишет код и имя, набранный
// код отмечает свой кружок или «свой», палитра пишет код, pattern отвергает код не того
// вида, в отправке одно значение. Без скрипта — обычное текстовое поле со строкой
// и поле кода. Снимки 1280 и 390 px в обеих темах кладутся в каталог SHOTS (не в
// репозиторий).
//
//   cd документация && oscript main.os --порт 3414
//   NODE_PATH=/tmp/claude-501/pw/node_modules BASE=http://localhost:3414 SHOTS=/tmp/снимки \
//     node tests/браузер/поля-список-цвет.js

const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const АДРЕС = process.env.BASE || 'http://localhost:3333';
const СНИМКИ = process.env.SHOTS || '/tmp/снимки-поля';
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

// Поле кладётся в форму, и форма отправляется кнопкой: отправка перехвачена, а то, что
// ушло бы на сервер, — FormData этой отправки.
async function отправка(p, селектор, номер) {
	return p.evaluate(([с, н]) => new Promise((готово) => {
		const поле = document.querySelectorAll(с)[н];
		let форма = поле.closest('form');
		if (!форма) {
			форма = document.createElement('form');
			форма.method = 'post';
			поле.parentNode.insertBefore(форма, поле);
			форма.appendChild(поле);
		}
		const кнопка = document.createElement('button');
		кнопка.type = 'submit';
		форма.appendChild(кнопка);
		форма.addEventListener('submit', (e) => {
			e.preventDefault();
			готово([...new FormData(форма).entries()].map(([имя, значение]) => [имя, String(значение)]));
			кнопка.remove();
		}, { once: true });
		кнопка.click();
		setTimeout(() => готово(null), 1000); // форма не ушла: негодное поле
	}), [селектор, номер]);
}

async function список(p, н) {
	return p.evaluate((н) => {
		const корень = document.querySelectorAll('[data-chips]')[н];
		const ввод = корень.querySelector('.chips-in__input');
		const скрытое = корень.querySelector('[data-chips-value]');
		const лист = корень.querySelector('.chips-in__list');
		return {
			живой: корень.hasAttribute('data-chips-live'),
			плашки: [...лист.querySelectorAll('.chips-in__text')].map((т) => т.textContent),
			видны: лист.getClientRects().length > 0,
			ввод: ввод.value,
			имяВвода: ввод.getAttribute('name'),
			скрытое: скрытое.value,
			скрытоеВыкл: скрытое.disabled,
			фокус: document.activeElement === ввод,
			крестики: [...лист.querySelectorAll('[data-chips-remove]')].map((к) => к.getAttribute('aria-label')),
		};
	}, н);
}

async function цвет(p, н) {
	return p.evaluate((н) => {
		const корень = document.querySelectorAll('[data-swatches]')[н];
		const код = корень.querySelector('.swatches__code');
		const отмечен = корень.querySelector('.swatches__radio:checked');
		const свой = корень.querySelector('.swatches__item--own .swatches__dot');
		return {
			ряд: корень.querySelector('[data-swatches-row]').getClientRects().length > 0,
			код: код.value,
			видимКод: код.getClientRects().length > 0,
			отмечен: отмечен ? отмечен.value : null,
			имя: корень.querySelector('[data-swatches-name]').textContent,
			свой: свой.style.getPropertyValue('--_swatch'),
			негоден: !код.checkValidity(),
		};
	}, н);
}

(async () => {
	fs.mkdirSync(СНИМКИ, { recursive: true });
	const браузер = await chromium.launch({ executablePath: браузерныйДвижок() });

	// --- список со скриптом -----------------------------------------------------------------
	{
		const контекст = await браузер.newContext({ viewport: { width: 1280, height: 900 } });
		const p = await контекст.newPage();
		await p.goto(страница('поле'), { waitUntil: 'networkidle' });
		const корень = p.locator('[data-chips]').first();
		await корень.scrollIntoViewIfNeeded();
		const ввод = корень.locator('.chips-in__input');

		let с = await список(p, 0);
		проверить(с.живой && с.видны, 'скрипт оживил список: плашки видны');
		проверить(с.плашки.join('|') === '*.os|*.bsl|*.json', 'плашки из строки сервера: ' + с.плашки);
		проверить(с.ввод === '' && с.имяВвода === null, 'строка ввода пуста и без имени');
		проверить(!с.скрытоеВыкл && с.скрытое === '*.os, *.bsl, *.json', 'скрытое поле включено и несёт строку');

		await ввод.click();
		await p.keyboard.type('*.md');
		await p.keyboard.press('Enter');
		с = await список(p, 0);
		проверить(с.плашки.join('|') === '*.os|*.bsl|*.json|*.md' && с.ввод === '', 'Enter добавил плашку');
		проверить(с.крестики[3] === 'Убрать «*.md»', 'крестик новой плашки называет значение: ' + с.крестики[3]);

		await p.keyboard.type('a, b,');
		с = await список(p, 0);
		проверить(с.плашки.slice(4).join('|') === 'a|b' && с.ввод === '', 'запятая добавила плашки: ' + с.плашки);

		await p.keyboard.type('*.os');
		await p.keyboard.press('Enter');
		с = await список(p, 0);
		проверить(с.плашки.length === 6, 'повтор не добавлен');

		await корень.locator('[data-chips-remove][aria-label="Убрать «*.bsl»"]').click();
		с = await список(p, 0);
		проверить(с.плашки.indexOf('*.bsl') < 0 && с.фокус, 'крестик снял плашку, фокус в строке ввода');
		проверить(с.скрытое === '*.os, *.json, *.md, a, b', 'скрытое поле вслед за плашками: ' + с.скрытое);

		await p.keyboard.press('Backspace');
		с = await список(p, 0);
		проверить(с.плашки.join('|') === '*.os|*.json|*.md|a', 'Backspace в пустой строке снял последнюю');

		await p.keyboard.type('*.txt');
		await p.locator('h1').first().click(); // уход из строки
		с = await список(p, 0);
		проверить(с.плашки[с.плашки.length - 1] === '*.txt' && с.ввод === '', 'уход из строки сделал плашку');

		const ушло = await отправка(p, '[data-chips]', 0);
		const своё = (ушло || []).filter(([имя]) => имя === 'маски');
		проверить(своё.length === 1 && своё[0][1] === '*.os, *.json, *.md, a, *.txt',
			'отправка отдаёт одну строку через запятую: ' + JSON.stringify(своё));
		await контекст.close();
	}

	// --- цвет со скриптом ---------------------------------------------------------------------
	{
		const контекст = await браузер.newContext({ viewport: { width: 1280, height: 900 } });
		const p = await контекст.newPage();
		await p.goto(страница('поле'), { waitUntil: 'networkidle' });
		const корень = p.locator('[data-swatches]').first();
		await корень.scrollIntoViewIfNeeded();

		let с = await цвет(p, 0);
		проверить(с.ряд && с.отмечен === '#1a73e8' && с.имя === 'Синий', 'ряд виден, отмечен синий: ' + JSON.stringify(с));

		await корень.locator('label[title="Зелёный"]').click();
		с = await цвет(p, 0);
		проверить(с.код === '#188038' && с.имя === 'Зелёный', 'кружок написал код и имя: ' + JSON.stringify(с));

		await корень.locator('.swatches__radio:checked').focus();
		await p.keyboard.press('ArrowRight');
		с = await цвет(p, 0);
		проверить(с.отмечен === '#e8710a' && с.код === '#e8710a', 'стрелка выбрала следующий образец: ' + с.отмечен);

		await корень.locator('.swatches__code').fill('#8E24AA');
		с = await цвет(p, 0);
		проверить(с.отмечен === null && с.свой === '#8e24aa' && с.имя === 'Свой', 'набранный код — свой: ' + JSON.stringify(с));

		await корень.locator('.swatches__code').fill('#d93025');
		с = await цвет(p, 0);
		проверить(с.отмечен === '#d93025' && с.имя === 'Красный' && с.свой === '', 'набранный код образца отметил его');

		await корень.locator('[data-swatches-own]').evaluate((палитра) => {
			палитра.value = '#00897b';
			палитра.dispatchEvent(new Event('input', { bubbles: true }));
		});
		с = await цвет(p, 0);
		проверить(с.код === '#00897b' && с.имя === 'Свой' && с.свой === '#00897b', 'палитра написала свой код');

		let ушло = await отправка(p, '[data-swatches]', 0);
		let своё = (ушло || []).filter(([имя]) => имя === 'акцент');
		проверить(своё.length === 1 && своё[0][1] === '#00897b', 'в отправке одно значение — код: ' + JSON.stringify(ушло));

		await корень.locator('.swatches__code').fill('синий');
		с = await цвет(p, 0);
		проверить(с.негоден, 'pattern отвергает код не того вида');
		ушло = await отправка(p, '[data-swatches]', 0);
		проверить(ушло === null, 'форма с негодным кодом не ушла');

		await корень.locator('.swatches__code').fill('');
		с = await цвет(p, 0);
		проверить(с.отмечен === '' && с.имя === 'По умолчанию', 'пусто — «по умолчанию»');
		await контекст.close();
	}

	// --- без скрипта --------------------------------------------------------------------------
	{
		const контекст = await браузер.newContext({ viewport: { width: 1280, height: 900 }, javaScriptEnabled: false });
		const p = await контекст.newPage();
		await p.goto(страница('поле'), { waitUntil: 'networkidle' });
		const с = await p.evaluate(() => {
			const корень = document.querySelector('[data-chips]');
			const ввод = корень.querySelector('.chips-in__input');
			const форма = document.createElement('form');
			корень.parentNode.insertBefore(форма, корень);
			форма.appendChild(корень);
			const цвет = document.querySelector('[data-swatches]');
			const формаЦвета = document.createElement('form');
			цвет.parentNode.insertBefore(формаЦвета, цвет);
			формаЦвета.appendChild(цвет);
			return {
				плашкиВидны: корень.querySelector('.chips-in__list').getClientRects().length > 0,
				ввод: ввод.value,
				видимВвод: ввод.getClientRects().length > 0,
				ушло: [...new FormData(форма).entries()].map(([и, з]) => [и, String(з)]),
				ряд: цвет.querySelector('[data-swatches-row]').getClientRects().length > 0,
				видимКод: цвет.querySelector('.swatches__code').getClientRects().length > 0,
				ушлоЦвет: [...new FormData(формаЦвета).entries()].map(([и, з]) => [и, String(з)]),
			};
		});
		проверить(!с.плашкиВидны && с.видимВвод && с.ввод === '*.os, *.bsl, *.json',
			'без скрипта список — текстовое поле со строкой');
		проверить(JSON.stringify(с.ушло) === '[["маски","*.os, *.bsl, *.json"]]',
			'без скрипта уходит одна строка: ' + JSON.stringify(с.ушло));
		проверить(!с.ряд && с.видимКод, 'без скрипта у цвета — поле кода');
		проверить(JSON.stringify(с.ушлоЦвет) === '[["акцент","#1a73e8"]]',
			'без скрипта цвет уходит кодом: ' + JSON.stringify(с.ушлоЦвет));
		await контекст.close();
	}

	// --- снимки 1280 и 390 в обеих темах --------------------------------------------------------
	for (const сокрипт of [true, false]) {
		for (const [тема, значение] of [['светлая', 'тема=светлая'], ['тёмная', 'тема=тёмная']]) {
			for (const ширина of [1280, 390]) {
				const контекст = await браузер.newContext({
					viewport: { width: ширина, height: ширина > 500 ? 900 : 844 },
					javaScriptEnabled: сокрипт,
				});
				await контекст.addCookies([{ name: КУКА, value: encodeURIComponent(значение), url: АДРЕС }]);
				const p = await контекст.newPage();
				await p.goto(страница('поле'), { waitUntil: 'networkidle' });
				const метка = `${ширина}-${тема}${сокрипт ? '' : '-без-js'}`;
				for (const [селектор, н, имя] of [['[data-chips]', 0, 'список'], ['[data-swatches]', 0, 'цвет'],
					['[data-swatches]', 1, 'цвет-свой']]) {
					// снимок образца целиком: рамка живого образца вокруг поля
					const образец = p.locator(селектор).nth(н).locator('xpath=ancestor::*[contains(@class,"docs-sample__preview")][1]');
					const цель = (await образец.count()) ? образец : p.locator(селектор).nth(н);
					await цель.scrollIntoViewIfNeeded();
					if (сокрипт && имя === 'список') {
						await p.locator(селектор).nth(н).locator('.chips-in__input').focus();
					}
					await p.waitForTimeout(400);
					await цель.screenshot({ path: path.join(СНИМКИ, `поле-${имя}-${метка}.png`) });
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

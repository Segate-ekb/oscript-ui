// Браузерный прогон шагов 1–3 выпуска 0.10 против локального сайта документации:
// единое меню с постоянным порядком групп, дом настроек на телефоне, рубрики и опасный
// раздел. Снимки 1280 и 390 px в обеих темах кладутся в каталог SHOTS (не в репозиторий).
//
//   cd документация && oscript main.os --порт 3391
//   NODE_PATH=/tmp/claude-501/pw/node_modules BASE=http://localhost:3391 SHOTS=/tmp/снимки \
//     node tests/браузер/дом-настроек.js
//
// Скрипт кита ни одной из проверок не нужен: всё, что здесь проверяется, делают разметка
// и лист. Прогон идёт и с выключенным JavaScript — результат обязан совпасть.

const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const АДРЕС = process.env.BASE || 'http://localhost:3333';
const СНИМКИ = process.env.SHOTS || '/tmp/снимки-дом-настроек';
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

// Панель меню без пометок текущего: на страницах одного раздела документации она обязана
// совпасть байт в байт — порядок и состав групп от страницы не зависят.
async function панельБезПометок(p) {
	return p.evaluate(() => {
		const панель = document.getElementById('hubmenu').cloneNode(true);
		панель.querySelectorAll('[aria-current]').forEach((у) => у.removeAttribute('aria-current'));
		return панель.innerHTML;
	});
}

// Порядок групп панели по их классам и именам.
async function группы(p) {
	return p.evaluate(() => [...document.querySelectorAll('#hubmenu > nav, #hubmenu > .hubmenu__account, #hubmenu > .hubmenu__foot')]
		.map((у) => у.className + (у.getAttribute('aria-label') ? ' «' + у.getAttribute('aria-label') + '»' : '')));
}

(async () => {
	fs.mkdirSync(СНИМКИ, { recursive: true });
	const браузер = await chromium.launch({ executablePath: браузерныйДвижок() });

	for (const сокрипт of [true, false]) {
		for (const [тема, значение] of [['светлая', 'тема=светлая'], ['тёмная', 'тема=тёмная']]) {
			for (const ширина of [1280, 390]) {
				const контекст = await браузер.newContext({
					viewport: { width: ширина, height: ширина > 500 ? 900 : 844 },
					javaScriptEnabled: сокрипт,
				});
				await контекст.addCookies([{ name: КУКА, value: encodeURIComponent(значение), url: АДРЕС }]);
				const p = await контекст.newPage();
				const метка = `${ширина}-${тема}${сокрипт ? '' : '-без-js'}`;

				await p.goto(страница('дом-настроек'), { waitUntil: 'networkidle' });
				if (тема === 'светлая' && сокрипт) {
					await p.screenshot({ path: path.join(СНИМКИ, `дом-настроек-${ширина}-${тема}.png`), fullPage: false });
				}
				// образец «Три рубрики и опасный раздел» — дом, у которого есть рубрики
				const домСРубриками = p.locator('.settings:has(.tree__rubric)').first();
				await домСРубриками.scrollIntoViewIfNeeded();
				if (сокрипт) await домСРубриками.screenshot({ path: path.join(СНИМКИ, `рубрики-${метка}.png`) });

				const образец = await p.evaluate(() => {
					const дом = [...document.querySelectorAll('.settings')].find((д) => д.querySelector('.tree__rubric'));
					const текущий = дом && дом.querySelector('.settings__current');
					const колонка = дом && дом.querySelector('.settings__nav');
					return {
						рубрик: дом ? дом.querySelectorAll('.tree__rubric').length : 0,
						последнийОпасный: дом ? дом.querySelector('.tree__item:last-child .tree__link--danger') !== null : false,
						текущийВиден: текущий ? getComputedStyle(текущий).display !== 'none' : null,
						текущийТекст: текущий ? текущий.textContent.trim() : '',
						колонкаВидна: колонка ? getComputedStyle(колонка).display !== 'none' : null,
					};
				});
				проверить(образец.рубрик === 3, `${метка}: у образца три рубрики (${образец.рубрик})`);
				проверить(образец.последнийОпасный, `${метка}: опасный раздел последним`);
				if (ширина === 390) {
					проверить(образец.текущийВиден === true, `${метка}: имя текущего раздела под заголовком видно`);
					проверить(образец.колонкаВидна === false, `${метка}: колонки разделов нет — меню одно`);
				} else {
					проверить(образец.текущийВиден === false, `${метка}: на широком имя раздела скрыто`);
					проверить(образец.колонкаВидна === true, `${метка}: колонка разделов на месте`);
				}
				проверить(образец.текущийТекст === 'Участники', `${метка}: текущий раздел — «${образец.текущийТекст}»`);

				const порядок = await группы(p);
				const место = (часть) => порядок.findIndex((г) => г.includes(часть));
				проверить(место('hubmenu__section--screen') >= 0 && место('hubmenu__section--screen') < место('hubmenu__section--roads'),
					`${метка}: разделы экрана — до дорог: ${порядок.join(' | ')}`);

				if (ширина === 390 && сокрипт) {
					const бургер = p.locator('.hubmenu__opener button');
					await бургер.click();
					await p.waitForTimeout(450);
					await p.screenshot({ path: path.join(СНИМКИ, `шторка-${метка}.png`) });
					const перваяГруппа = await p.evaluate(() => {
						const первая = document.querySelector('#hubmenu > nav');
						return первая ? первая.className + ' «' + первая.getAttribute('aria-label') + '»' : '';
					});
					проверить(перваяГруппа.includes('hubmenu__section--screen'), `${метка}: первая группа шторки — разделы экрана: ${перваяГруппа}`);
					await p.keyboard.press('Escape');
					await p.waitForTimeout(300);
					const фокус = await p.evaluate(() => document.activeElement && document.activeElement.closest('.hubmenu__opener') !== null);
					проверить(фокус, `${метка}: после Esc фокус вернулся на бургер`);
				}

				if (ширина === 390) {
					// одна и та же панель на двух страницах одного раздела — без пометок текущего
					const перваяПанель = await панельБезПометок(p);
					await p.goto(страница('каркас-страницы'), { waitUntil: 'networkidle' });
					const втораяПанель = await панельБезПометок(p);
					проверить(перваяПанель === втораяПанель, `${метка}: панель на двух страницах раздела одинакова без aria-current`);
				}

				await контекст.close();
			}
		}
	}

	await браузер.close();
	console.log(ошибки.length ? `\nБед: ${ошибки.length}` : '\nВсё на месте.');
	console.log('Снимки: ' + СНИМКИ);
	process.exit(ошибки.length ? 1 : 0);
})().catch((е) => { console.error(е); process.exit(1); });

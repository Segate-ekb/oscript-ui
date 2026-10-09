// Браузерный прогон шагов 12 и 13 выпуска 0.12 против локального сайта документации:
// сегменты и подсказка. Обоим скрипт кита не нужен, поэтому главное проверяется БЕЗ
// скрипта: отмечен ровно один сегмент, щелчок и стрелки меняют выбор, набор полей
// отмеченного сегмента виден, остальные спрятаны (лист, :has(:checked)); значок «?»
// открывает поповер (popover), Esc закрывает и возвращает фокус, поле ссылается на поповер
// из aria-describedby, на телефоне поповер не уходит за край. Со скриптом — СохранятьСразу
// отправляет форму сам. Снимки 1280 и 390 px в обеих темах кладутся в каталог SHOTS
// (не в репозиторий).
//
//   cd документация && oscript main.os --порт 3398
//   NODE_PATH=/tmp/claude-501/pw/node_modules BASE=http://localhost:3398 SHOTS=/tmp/снимки \
//     node tests/браузер/сегменты-и-подсказка.js

const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const АДРЕС = process.env.BASE || 'http://localhost:3333';
const СНИМКИ = process.env.SHOTS || '/tmp/снимки-сегменты';
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

// Состояние набора сегментов на странице: что отмечено, какие панели видны.
async function сегменты(p, имя) {
	return p.evaluate((и) => {
		const группа = document.querySelector('.segments:has(input[name="' + и + '"])');
		const обёртка = группа.closest('.segments-set');
		const видна = (у) => у.getClientRects().length > 0;
		const отмечены = [...группа.querySelectorAll('input:checked')].map((к) => к.value);
		const панели = обёртка ? [...обёртка.querySelectorAll(':scope > .segments__panel')] : [];
		return {
			роль: группа.getAttribute('role'),
			имя: группа.getAttribute('aria-label'),
			отмечены,
			видимые: панели.filter(видна).map((п) => п.dataset.segment),
		};
	}, имя);
}

// Поповер подсказки номер N на странице: открыт ли, где стоит, куда ведут ссылки.
async function поповер(p, номер) {
	return p.evaluate((н) => {
		const кнопка = document.querySelectorAll('button.help')[н];
		const поп = document.getElementById(кнопка.getAttribute('popovertarget'));
		const r = поп.getBoundingClientRect();
		const обёртка = кнопка.closest('.field-help');
		const поле = обёртка ? обёртка.querySelector('input, select, textarea') : null;
		return {
			открыт: поп.matches(':popover-open'),
			текст: поп.textContent,
			рамка: { left: r.left, right: r.right, top: r.top, bottom: r.bottom },
			окно: { w: window.innerWidth, h: window.innerHeight },
			описание: поле ? поле.getAttribute('aria-describedby') : null,
			ид: поп.id,
			имяКнопки: кнопка.getAttribute('aria-label'),
			вМетке: !!кнопка.closest('label'),
			фокусНаКнопке: document.activeElement === кнопка,
		};
	}, номер);
}

(async () => {
	fs.mkdirSync(СНИМКИ, { recursive: true });
	const браузер = await chromium.launch({ executablePath: браузерныйДвижок() });

	// --- сегменты без скрипта ---------------------------------------------------------------
	{
		const контекст = await браузер.newContext({ viewport: { width: 1280, height: 900 }, javaScriptEnabled: false });
		const p = await контекст.newPage();
		await p.goto(страница('сегменты'), { waitUntil: 'networkidle' });

		let с = await сегменты(p, 'theme');
		проверить(с.роль === 'radiogroup' && с.имя === 'Тема', 'группа: role=radiogroup с именем «Тема»');
		проверить(JSON.stringify(с.отмечены) === '["auto"]', 'отмечен ровно один — «Авто»: ' + с.отмечены);

		с = await сегменты(p, 'auth');
		проверить(JSON.stringify(с.отмечены) === '["key"]', 'способ входа: отмечен первый');
		проверить(JSON.stringify(с.видимые) === '["key"]', 'виден набор «Ключ»: ' + с.видимые);

		const вход = p.locator('.segments:has(input[name="auth"])').first();
		await вход.locator('label', { hasText: 'Пароль' }).click();
		с = await сегменты(p, 'auth');
		проверить(JSON.stringify(с.отмечены) === '["password"]', 'щелчок по «Пароль» отметил его, и только его');
		проверить(JSON.stringify(с.видимые) === '["password"]', 'без скрипта виден набор «Пароль»: ' + с.видимые);
		проверить(await p.locator('input[name="secret"]').first().isVisible(), 'поле пароля видно');
		проверить(!(await p.locator('input[name="token"]').first().isVisible()), 'поле ключа спрятано');

		// стрелка — движок браузера: выбор уходит на следующий сегмент, набор следом
		await p.locator('input[name="auth"][value="password"]').first().focus();
		await p.keyboard.press('ArrowRight');
		с = await сегменты(p, 'auth');
		проверить(JSON.stringify(с.отмечены) === '["none"]', 'стрелка вправо отметила «Без входа»');
		проверить(с.видимые.length === 0, 'у «Без входа» набора нет — под группой пусто');
		await p.keyboard.press('ArrowLeft');
		await p.keyboard.press('ArrowLeft');
		с = await сегменты(p, 'auth');
		проверить(JSON.stringify(с.видимые) === '["key"]', 'стрелками назад — снова «Ключ»');

		// выбор уходит с формой под именем сегментов
		const данные = await p.evaluate(() => {
			const форма = document.querySelector('input[name="auth"]').form;
			return new FormData(форма).getAll('auth');
		});
		проверить(JSON.stringify(данные) === '["key"]', 'форма отправит auth=key: ' + данные);

		// сегменты в строке таблицы: у каждой формы свой выбор
		с = await сегменты(p, 'role');
		проверить(с.отмечены.length === 1, 'в строке таблицы отмечен один');
		const малые = await p.locator('.segments--small').count();
		проверить(малые >= 2, 'малые сегменты в строках: ' + малые);
		const высота = await p.locator('.segments--small .segments__label').first().evaluate((у) => у.getBoundingClientRect().height);
		проверить(высота <= 33, 'малые ниже обычных: ' + высота);
		await контекст.close();
	}

	// --- сегменты со скриптом: СохранятьСразу -------------------------------------------------
	{
		const контекст = await браузер.newContext({ viewport: { width: 1280, height: 900 } });
		const p = await контекст.newPage();
		await p.goto(страница('сегменты'), { waitUntil: 'networkidle' });
		const запрос = p.waitForRequest((з) => з.method() === 'POST' && decodeURIComponent(з.url()).endsWith('/уведомления'),
			{ timeout: 5000 }).catch(() => null);
		await p.locator('.segments:has(input[name="notify"]) label', { hasText: 'Никаких' }).click();
		const з = await запрос;
		проверить(!!з, 'выбор с СохранятьСразу сам отправил форму');
		проверить(!!з && (з.postData() || '').includes('notify=none'), 'и отправил выбранное: notify=none');
		await контекст.close();
	}

	// --- подсказка без скрипта ----------------------------------------------------------------
	for (const ширина of [1280, 390]) {
		const контекст = await браузер.newContext({
			viewport: { width: ширина, height: ширина > 500 ? 900 : 844 }, javaScriptEnabled: false,
		});
		const p = await контекст.newPage();
		await p.goto(страница('подсказка'), { waitUntil: 'networkidle' });
		const всего = await p.locator('button.help').count();
		проверить(всего >= 4, `${ширина}: значков на странице ${всего}`);

		let п = await поповер(p, 0);
		проверить(!п.открыт, `${ширина}: поповер закрыт до нажатия`);
		проверить(п.описание === п.ид, `${ширина}: aria-describedby поля ведёт на поповер (${п.описание})`);
		проверить(п.имяКнопки === 'Справка: Ключ проекта', `${ширина}: имя значка «${п.имяКнопки}»`);
		проверить(!п.вМетке, `${ширина}: значок вне <label> поля`);

		for (let н = 0; н < всего; н++) {
			const кнопка = p.locator('button.help').nth(н);
			await кнопка.scrollIntoViewIfNeeded();
			await кнопка.click();
			await p.waitForTimeout(250);
			п = await поповер(p, н);
			проверить(п.открыт && п.текст.length > 10, `${ширина}: значок ${н + 1} открыл поповер`);
			const поле = ширина > 500 ? 0 : 15;
			проверить(п.рамка.left >= поле - 0.5 && п.рамка.right <= п.окно.w - поле + 0.5
				&& п.рамка.top >= 0 && п.рамка.bottom <= п.окно.h,
				`${ширина}: поповер ${н + 1} в экране (${Math.round(п.рамка.left)}…${Math.round(п.рамка.right)} из ${п.окно.w})`);
			await p.keyboard.press('Escape');
			п = await поповер(p, н);
			проверить(!п.открыт && п.фокусНаКнопке, `${ширина}: Esc закрыл поповер ${н + 1}, фокус на значке`);
		}

		// щелчок мимо закрывает поповер — движок, без скрипта
		await p.locator('button.help').first().click();
		await p.mouse.click(5, 5);
		п = await поповер(p, 0);
		проверить(!п.открыт, `${ширина}: щелчок мимо закрыл поповер`);
		const поля = await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
		проверить(поля, `${ширина}: страница без горизонтальной прокрутки`);
		await контекст.close();
	}

	// --- снимки 1280 и 390 в обеих темах ---------------------------------------------------------
	for (const [тема, значение] of [['светлая', 'тема=светлая'], ['тёмная', 'тема=тёмная']]) {
		for (const ширина of [1280, 390]) {
			const контекст = await браузер.newContext({ viewport: { width: ширина, height: ширина > 500 ? 900 : 844 } });
			await контекст.addCookies([{ name: КУКА, value: encodeURIComponent(значение), url: АДРЕС }]);
			const p = await контекст.newPage();
			const метка = `${ширина}-${тема}`;

			await p.goto(страница('сегменты'), { waitUntil: 'networkidle' });
			const образцы = p.locator('.segments-set, .segments:not(.segments-set .segments)');
			const тема_ = p.locator('.segments:has(input[name="theme"])').first();
			await тема_.scrollIntoViewIfNeeded();
			await тема_.screenshot({ path: path.join(СНИМКИ, `сегменты-тема-${метка}.png`) });
			const вход = p.locator('.segments-set:has(input[name="auth"])').first();
			await вход.locator('.segments__item', { hasText: 'Пароль' }).click();
			await p.locator('input[name="secret"]').first().focus();
			await p.waitForTimeout(400);
			await вход.screenshot({ path: path.join(СНИМКИ, `сегменты-наборы-${метка}.png`) });
			const таблица = p.locator('table:has(.segments--small), .table:has(.segments--small)').first();
			if (await таблица.count()) {
				await таблица.scrollIntoViewIfNeeded();
				await таблица.screenshot({ path: path.join(СНИМКИ, `сегменты-малые-${метка}.png`) });
			}
			проверить(await образцы.count() > 3, `${метка}: образцы сегментов на месте`);
			проверить(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
				`${метка}: сегменты без горизонтальной прокрутки`);

			await p.goto(страница('подсказка'), { waitUntil: 'networkidle' });
			const кнопка = p.locator('button.help').first();
			await кнопка.scrollIntoViewIfNeeded();
			await кнопка.click();
			await p.waitForTimeout(400);
			await p.screenshot({ path: path.join(СНИМКИ, `подсказка-поле-${метка}.png`) });
			await p.keyboard.press('Escape');
			await контекст.close();
		}
	}

	await браузер.close();
	console.log(ошибки.length ? `\nБЕД: ${ошибки.length}` : '\nвсё в порядке');
	process.exit(ошибки.length ? 1 : 0);
})();

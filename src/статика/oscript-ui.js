/* oscript-ui — скрипт кита: движение Material по образцу MUI там, где одного CSS мало.
 *
 * ТОЛЬКО УЛУЧШЕНИЕ. Страница без этого файла работает целиком и выглядит законченной:
 * ссылки, формы, меню, окна и раскрывашки — разметка и движок браузера. Скрипт добавляет
 * вот что и ничего не решает за сервер:
 *   1. рябь — круг от точки нажатия на кнопке, ссылке-пункте, вкладке, чипе;
 *   2. пустоту поля (data-empty) — по ней лист опускает подпись на место значения;
 *   3. признак прокрутки шапки (data-scrolled) — по нему шапка меняет цвет и даёт тень;
 *   4. имя перехода индикатора вкладок (data-vt) — по нему движок везёт индикатор
 *      со старой страницы на новую (View Transitions между документами);
 *   5. крестик закрываемого тоста — тост гаснет и уходит со страницы;
 *   6. тихую отправку (data-quiet) — форма уходит запросом в фоне, а ответ сервера
 *      ложится на страницу НА МЕСТО: без перезагрузки, с прежней прокруткой, фокусом
 *      и раскрытыми раскрывашками; плюс мгновенная смена темы (data-theme-toggle),
 *      отправка по изменению (data-autosubmit) и подсветка несохранённого (data-savebar);
 *   7. шаги (data-steps) — одна панель длинной формы за раз, «Дальше» проверяет поля шага.
 *
 * Глобальных имён скрипт не заводит, разметку не печатает — только атрибуты и рябь.
 * Обновив страницу на месте, он сообщает об этом событием «oscript-ui:update» на document:
 * скрипт инсталляции, который оживляет элементы при загрузке, оживляет по нему новые.
 * Отдаётся файлом с хешем содержимого в адресе, как и базовый лист.
 */
(function () {
	'use strict';

	var doc = document;
	var calm = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)');

	/* --- 1. рябь ------------------------------------------------------------------- */

	var RIPPLE = [
		'.button', '.chip', '.tabs__link', '.tree__link', '.pagination__link', '.top__link',
		'.hubmenu__account', '.panel__head', '.section__fold > .fold__head', 'a.tag',
		'.tile--link', '.toast__close', '.cmd .copy', '.from-config__env .copy'
	].join(',');

	var MIN_VISIBLE = 225; // мс: рябь от короткого касания успевает показаться

	function rippleHost(target) {
		var host = target && target.closest ? target.closest(RIPPLE) : null;
		if (!host || host.disabled || host.getAttribute('aria-disabled') === 'true') {
			return null;
		}
		return host;
	}

	function spawn(host, x, y) {
		var rect = host.getBoundingClientRect();
		var cx = x === undefined ? rect.width / 2 : x - rect.left;
		var cy = y === undefined ? rect.height / 2 : y - rect.top;
		var r = Math.sqrt(Math.pow(Math.max(cx, rect.width - cx), 2)
			+ Math.pow(Math.max(cy, rect.height - cy), 2));

		if (getComputedStyle(host).position === 'static') {
			host.style.position = 'relative';
		}

		var box = doc.createElement('span');
		box.className = 'ripple';
		box.setAttribute('aria-hidden', 'true');
		var wave = doc.createElement('span');
		wave.className = 'ripple__wave';
		wave.style.width = wave.style.height = (r * 2) + 'px';
		wave.style.left = (cx - r) + 'px';
		wave.style.top = (cy - r) + 'px';
		box.appendChild(wave);
		host.appendChild(box);

		var born = Date.now();
		return function release() {
			var wait = Math.max(0, MIN_VISIBLE - (Date.now() - born));
			setTimeout(function () {
				wave.classList.add('ripple__wave--out');
				setTimeout(function () {
					if (box.parentNode) {
						box.parentNode.removeChild(box);
					}
				}, 400);
			}, wait);
		};
	}

	function once(release) {
		var done = false;
		return function () {
			if (!done) {
				done = true;
				release();
			}
		};
	}

	doc.addEventListener('pointerdown', function (e) {
		if (e.button !== 0 || (calm && calm.matches)) {
			return;
		}
		var host = rippleHost(e.target);
		if (!host) {
			return;
		}
		var release = once(spawn(host, e.clientX, e.clientY));
		['pointerup', 'pointercancel', 'pointerleave', 'dragstart'].forEach(function (type) {
			host.addEventListener(type, release, { once: true });
		});
		setTimeout(release, 2000); // страховка: отпускание ушло мимо элемента
	}, { passive: true });

	// С клавиатуры рябь идёт из середины — как у MUI на Enter и пробеле.
	doc.addEventListener('keydown', function (e) {
		if ((e.key !== 'Enter' && e.key !== ' ') || e.repeat || (calm && calm.matches)) {
			return;
		}
		var host = rippleHost(e.target);
		if (host && host === e.target) {
			once(spawn(host))();
		}
	});

	/* --- 2. пустота поля ------------------------------------------------------------ */

	// Подпись опускается только у полей, где значение — текст: выбор, дата, цвет и файл
	// всегда что-то показывают, и подпись у них всегда наверху.
	var FLOAT_TYPES = /^(text|search|email|url|tel|password|number)$/;

	function floats(control) {
		if (control.tagName === 'TEXTAREA') {
			return true;
		}
		return control.tagName === 'INPUT' && FLOAT_TYPES.test(control.type || 'text');
	}

	function markEmpty(control) {
		var field = control.closest('.field');
		if (!field || !floats(control)) {
			return;
		}
		var empty = control.value === '';
		try {
			empty = empty && !control.matches(':autofill');
		} catch (err) { /* движок без :autofill */ }
		field.toggleAttribute('data-empty', empty);
	}

	function markAll(root) {
		var list = (root || doc).querySelectorAll('.field > .field__control');
		for (var i = 0; i < list.length; i++) {
			markEmpty(list[i]);
		}
	}

	['input', 'change'].forEach(function (type) {
		doc.addEventListener(type, function (e) {
			if (e.target && e.target.classList && e.target.classList.contains('field__control')) {
				markEmpty(e.target);
			}
		});
	});
	// Сброс формы меняет значения без события ввода.
	doc.addEventListener('reset', function (e) {
		setTimeout(function () { markAll(e.target); }, 0);
	});
	// Автозаполнение браузера приходит позже загрузки и без события ввода.
	window.addEventListener('load', function () { markAll(); });
	markAll();

	/* --- 3. шапка при прокрутке ----------------------------------------------------- */

	// Шапку ищем на каждом кадре, а не один раз: тихая отправка может заменить её узел.
	var ticking = false;
	function paintTop() {
		ticking = false;
		var tops = doc.querySelectorAll('.top');
		var scrolled = window.scrollY > 0;
		for (var i = 0; i < tops.length; i++) {
			tops[i].toggleAttribute('data-scrolled', scrolled);
		}
	}
	window.addEventListener('scroll', function () {
		if (!ticking) {
			ticking = true;
			requestAnimationFrame(paintTop);
		}
	}, { passive: true });
	paintTop();

	/* --- 5. закрываемый тост --------------------------------------------------------- */

	doc.addEventListener('click', function (e) {
		var close = e.target.closest ? e.target.closest('.toast [data-close]') : null;
		if (!close) {
			return;
		}
		var toast = close.closest('.toast');
		var gone = function () {
			if (toast.parentNode) {
				toast.parentNode.removeChild(toast);
			}
		};
		if (calm && calm.matches) {
			gone();
			return;
		}
		toast.classList.add('toast--closing');
		setTimeout(gone, 250);
	});

	/* --- 4. индикатор вкладок между страницами -------------------------------------- */

	// Старая страница называет свой индикатор именем перехода, только если уходит по
	// вкладке того же ряда; новая — только если пришла так (отметка в sessionStorage).
	// Иначе индикатор не путешествует: переход на чужую страницу остаётся обычным.
	var VT_KEY = 'oscript-ui:tabs-vt';

	function sameUrl(a, b) {
		try {
			var x = new URL(a, location.href);
			var y = new URL(b, location.href);
			return x.origin === y.origin && x.pathname === y.pathname && x.search === y.search;
		} catch (err) {
			return false;
		}
	}

	function activeTabFor(url) {
		var bars = doc.querySelectorAll('.tabs');
		for (var i = 0; i < bars.length; i++) {
			var links = bars[i].querySelectorAll('a.tabs__link');
			for (var j = 0; j < links.length; j++) {
				if (sameUrl(links[j].href, url)) {
					return bars[i].querySelector('.tabs__link--active');
				}
			}
		}
		return null;
	}

	window.addEventListener('pageswap', function (e) {
		if (!e.viewTransition || !e.activation || !e.activation.entry) {
			return;
		}
		var current = activeTabFor(e.activation.entry.url);
		if (!current) {
			return;
		}
		current.setAttribute('data-vt', '');
		try { sessionStorage.setItem(VT_KEY, '1'); } catch (err) { /* без хранилища */ }
	});

	var revealed = false;
	function reveal(transition) {
		if (revealed) {
			return;
		}
		revealed = true;
		var came = false;
		try {
			came = sessionStorage.getItem(VT_KEY) === '1';
			sessionStorage.removeItem(VT_KEY);
		} catch (err) { /* без хранилища */ }
		if (!transition || !came) {
			return;
		}
		var current = activeTabFor(location.href);
		if (!current) {
			return;
		}
		current.setAttribute('data-vt', '');
		transition.finished.finally(function () {
			current.removeAttribute('data-vt');
		});
	}

	window.addEventListener('pagereveal', function (e) { reveal(e.viewTransition); });
	// Отложенный скрипт может опоздать к pagereveal: переход тогда ещё идёт, и движок,
	// который это умеет, отдаёт его здесь.
	if (doc.activeViewTransition) {
		reveal(doc.activeViewTransition);
	}

	// Страница, вернувшаяся из кэша истории, несёт метку, поставленную при уходе.
	window.addEventListener('pageshow', function (e) {
		if (!e.persisted) {
			return;
		}
		var marked = doc.querySelectorAll('.tabs__link[data-vt]');
		for (var i = 0; i < marked.length; i++) {
			marked[i].removeAttribute('data-vt');
		}
		markAll();
	});
	/* --- 6. тихая отправка ----------------------------------------------------------- */

	// Форма с data-quiet уходит fetch-ем, а не навигацией. Сервер ничего нового не учит:
	// он отвечает тем же, чем ответил бы браузеру, — обычно перенаправлением обратно на
	// страницу (POST → 303 → GET), и пришедший HTML ложится на текущую страницу морфингом:
	// узел, который не изменился, остаётся тем же узлом. Поэтому не прыгает прокрутка,
	// не теряется фокус, раскрытая раскрывашка остаётся раскрытой, а бегунок тумблера
	// доезжает своей анимацией, а не появляется заново.
	//
	// Всё, что пошло не так (сеть, не-HTML ответ, другие листы и скрипты), уводит в обычную
	// навигацию: страница хуже не становится, она просто перезагружается, как без скрипта.

	var NATIVE = 'oscriptUiNative'; // отметка формы: следующую отправку пропустить к браузеру
	var queues = new WeakMap();      // форма → очередь её отправок
	var pushed = false;              // уводили ли адрес вкладки pushState-ом

	function quietForm(form) {
		return form && form.hasAttribute && form.hasAttribute('data-quiet')
			&& !form.hasAttribute('target') && window.fetch && window.DOMParser;
	}

	function sameOrigin(url) {
		try {
			return new URL(url, location.href).origin === location.origin;
		} catch (err) {
			return false;
		}
	}

	function attr(el, name) {
		return el && el.getAttribute ? el.getAttribute(name) : null;
	}

	// Куда и как уходит форма с учётом кнопки, которой её отправили: у кнопки свои
	// formaction, formmethod, formtarget, formenctype.
	function plan(form, submitter) {
		var action = attr(submitter, 'formaction') || form.getAttribute('action') || location.href;
		var method = (attr(submitter, 'formmethod') || form.getAttribute('method') || 'get').toLowerCase();
		var enctype = attr(submitter, 'formenctype') || form.getAttribute('enctype') || '';
		var data;
		try {
			data = submitter ? new FormData(form, submitter) : new FormData(form);
		} catch (err) {
			// движок без второго аргумента FormData: имя нажатой кнопки докладываем сами
			data = new FormData(form);
			if (submitter && submitter.name) {
				data.append(submitter.name, submitter.value);
			}
		}
		var url = new URL(action, location.href);
		var init = { method: method === 'post' ? 'POST' : 'GET', credentials: 'same-origin',
			headers: { 'Accept': 'text/html' } };
		if (init.method === 'GET') {
			url.search = new URLSearchParams(data).toString();
		} else if (/multipart/i.test(enctype)) {
			init.body = data;
		} else {
			// заголовок — ровно как у браузера при обычной отправке: fetch сам дописал бы
			// «;charset=UTF-8», а сервер, который сверяет тип целиком (winow), тело с таким
			// заголовком не разбирает и получает форму пустой
			init.headers['Content-Type'] = 'application/x-www-form-urlencoded';
			init.body = new URLSearchParams(data).toString();
		}
		return { url: url.href, init: init,
			blank: (attr(submitter, 'formtarget') || '') !== '' };
	}

	function native(form, submitter) {
		form[NATIVE] = true;
		if (form.requestSubmit) {
			form.requestSubmit(submitter && submitter.form === form ? submitter : undefined);
		} else {
			form.submit();
		}
	}

	doc.addEventListener('submit', function (e) {
		var form = e.target;
		if (form[NATIVE]) {
			form[NATIVE] = false;
			return;
		}
		if (e.defaultPrevented || !quietForm(form)) {
			return;
		}
		var p = plan(form, e.submitter);
		if (p.blank || !sameOrigin(p.url)) {
			return; // новая вкладка или чужой сайт — это навигация, её делает браузер
		}
		e.preventDefault();
		if (form.hasAttribute('data-theme-toggle')) {
			flipTheme();
		}
		enqueue(form, e.submitter, p);
	});

	// Отправки одной формы идут строго по очереди и каждая — со своими данными: два щелчка
	// по теме — две смены, два щелчка по тумблеру — два сохранения. Ответ ложится на
	// страницу только последним: промежуточный устарел ещё в дороге.
	function enqueue(form, submitter, p) {
		var q = queues.get(form) || { tail: Promise.resolve(), size: 0 };
		queues.set(form, q);
		q.size++;
		form.setAttribute('aria-busy', 'true');
		form.removeAttribute('data-edited');
		q.tail = q.tail.then(function () {
			return send(form, submitter, p, function () { return q.size === 1; });
		}).finally(function () {
			q.size--;
			if (!q.size) {
				form.removeAttribute('aria-busy');
			}
		});
	}

	function send(form, submitter, p, last) {
		return fetch(p.url, p.init).then(function (response) {
			var type = response.headers.get('Content-Type') || '';
			if (!/text\/html/i.test(type) || !sameOrigin(response.url)) {
				fallback(form, submitter, p, response);
				return null;
			}
			return response.text().then(function (html) {
				if (last()) {
					land(form, response, html);
				}
			});
		}).catch(function () {
			fallback(form, submitter, p, null);
		});
	}

	function fallback(form, submitter, p, response) {
		if (response && p.init.method === 'GET') {
			location.assign(response.url);
		} else if (response && response.ok && response.redirected) {
			location.assign(response.url); // POST уже исполнен: повторять его нельзя
		} else {
			native(form, submitter);
		}
	}

	function resources(root) {
		var list = root.querySelectorAll('link[rel~="stylesheet"][href], script[src]');
		var out = [];
		for (var i = 0; i < list.length; i++) {
			out.push(list[i].getAttribute('href') || list[i].getAttribute('src'));
		}
		return out.join('\n');
	}

	function land(form, response, html) {
		var next = new DOMParser().parseFromString(html, 'text/html');
		// другой лист или скрипт — у новой страницы другое окружение, морфинг не годится
		if (resources(next) !== resources(doc)) {
			location.assign(response.url);
			return;
		}

		var url = new URL(response.url);
		var here = new URL(location.href);
		var moved = url.pathname !== here.pathname || url.search !== here.search;

		// Удачно сохранённая форма сбрасывается к умолчаниям, и значения берутся с сервера:
		// поле комментария после отправки пустеет, сохранённый тумблер — то, что запомнил
		// сервер. Ответ с ошибкой (4xx) несёт введённое и подсказки — его поля не трогаем.
		// Не трогаем и форму, в которой человек успел что-то поменять, пока шёл запрос.
		if (response.ok && form.isConnected && !form.hasAttribute('data-edited')) {
			form.reset();
		}

		doc.title = next.title;
		syncAttributes(doc.documentElement, next.documentElement);
		var tokens = doc.getElementById('токены-темы');
		var fresh = next.getElementById('токены-темы');
		if (tokens && fresh && tokens.textContent !== fresh.textContent) {
			tokens.textContent = fresh.textContent;
		}
		morphChildren(doc.body, next.body);
		syncAttributes(doc.body, next.body);

		if (moved) {
			history.pushState({ oscriptUi: true }, '', url.href + here.hash);
			pushed = true;
			window.scrollTo(0, 0);
		}
		markAll();
		paintTop();
		doc.dispatchEvent(new CustomEvent('oscript-ui:update', { detail: { url: url.href } }));
	}

	// Адрес вкладки, уведённый pushState-ом, показывает страницу, которой в истории
	// браузера нет: назад и вперёд по такой истории честно загружают страницу заново.
	window.addEventListener('popstate', function () {
		if (pushed) {
			location.reload();
		}
	});

	/* морфинг: старое дерево подстраивается под новое, неизменное остаётся на месте */

	// Состояние, которое знает только браузер: раскрыта ли раскрывашка, открыто ли окно.
	// Сервер о нём не знает и печатает узел закрытым, поэтому атрибут берётся у текущего.
	var KEEP = { DETAILS: 'open', DIALOG: 'open' };
	// Атрибуты, которые ставит сам скрипт кита.
	var OWN = { 'data-empty': 1, 'data-scrolled': 1, 'data-vt': 1, 'data-edited': 1, 'aria-busy': 1 };

	function syncAttributes(from, to) {
		var keep = KEEP[from.tagName];
		var i, a;
		for (i = from.attributes.length - 1; i >= 0; i--) {
			a = from.attributes[i];
			if (!to.hasAttribute(a.name) && a.name !== keep && !OWN[a.name]) {
				from.removeAttribute(a.name);
			}
		}
		for (i = 0; i < to.attributes.length; i++) {
			a = to.attributes[i];
			if (a.name !== keep && from.getAttribute(a.name) !== a.value) {
				from.setAttribute(a.name, a.value);
			}
		}
	}

	function sameKind(a, b) {
		if (a.nodeType !== b.nodeType) {
			return false;
		}
		if (a.nodeType !== 1) {
			return true;
		}
		return a.tagName === b.tagName && (a.id || '') === (b.id || '')
			&& (a.tagName !== 'INPUT' || a.type === b.type);
	}

	function morphNode(from, to) {
		if (from.nodeType !== 1) {
			if (from.nodeValue !== to.nodeValue) {
				from.nodeValue = to.nodeValue;
			}
			return;
		}
		syncAttributes(from, to);
		if (from.tagName === 'TEXTAREA') {
			// значение textarea — её текст по умолчанию; введённое человеком браузер держит
			// сам, пока его не сбросили
			if (from.defaultValue !== to.defaultValue) {
				from.defaultValue = to.defaultValue;
			}
			return;
		}
		morphChildren(from, to);
	}

	function morphChildren(from, to) {
		var a = from.firstChild;
		var b = to.firstChild;
		while (b) {
			var nextB = b.nextSibling;
			if (a && a.classList && a.classList.contains('ripple')) {
				var gone = a;
				a = a.nextSibling;
				from.removeChild(gone);
				continue;
			}
			if (a && sameKind(a, b)) {
				morphNode(a, b);
				a = a.nextSibling;
			} else {
				var twin = b.id ? doc.getElementById(b.id) : null;
				if (twin && twin.parentNode === from && sameKind(twin, b)) {
					from.insertBefore(twin, a);
					morphNode(twin, b);
				} else {
					from.insertBefore(doc.importNode(b, true), a);
				}
			}
			b = nextB;
		}
		while (a) {
			var rest = a.nextSibling;
			from.removeChild(a);
			a = rest;
		}
	}

	/* смена темы: обе палитры уже в голове страницы, переключение — один атрибут */

	// Сервер о смене узнаёт тем же запросом, что и без скрипта, — просто в фоне: cookie
	// пишет он один, второго источника правды о теме нет. Скрипт лишь не ждёт его ответа
	// и перекрашивает страницу сразу; ответ потом поменяет значок и подсказку кнопки.
	function flipTheme() {
		var root = doc.documentElement;
		// цель считается сейчас, а не в колбэке перехода: колбэк зовётся кадром позже,
		// и успей к нему ответ сервера поставить новую тему, он перевернул бы её обратно
		var next = root.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
		var apply = function () {
			root.setAttribute('data-theme', next);
		};
		if (doc.startViewTransition && !(calm && calm.matches)) {
			doc.startViewTransition(apply);
		} else {
			apply();
		}
	}

	/* отправка по изменению и несохранённое */

	doc.addEventListener('change', function (e) {
		var control = e.target;
		if (!control || !control.form) {
			return;
		}
		if (control.hasAttribute('data-autosubmit')) {
			if (control.form.requestSubmit) {
				control.form.requestSubmit();
			} else {
				control.form.submit();
			}
		}
	});

	['input', 'change'].forEach(function (type) {
		doc.addEventListener(type, function (e) {
			var form = e.target && e.target.form;
			if (!form) {
				return;
			}
			if (e.target.hasAttribute('data-autosubmit')) {
				return; // уйдёт на сервер сейчас же — несохранённым его не назвать
			}
			if (form.hasAttribute('aria-busy')) {
				form.setAttribute('data-edited', '');
			}
			var bars = form.querySelectorAll('[data-savebar]');
			for (var i = 0; i < bars.length; i++) {
				bars[i].classList.add('savebar--dirty');
			}
		});
	});

	/* --- 7. шаги (выпуск 0.11, шаг 10) --------------------------------------------------- */

	// Без скрипта шаги — панели <details> подряд, и форма уходит целиком: проверяет её
	// сервер. Скрипт показывает одну панель, полосу номеров и «Назад / Дальше» (сервер
	// печатает их hidden), а «Дальше» пускает на следующий шаг только тогда, когда поля
	// текущего годны: первому негодному браузер показывает свой отказ (reportValidity).
	// Признаки (data-steps, -bar, -go, -panel, -back, -next, -submit) объявлены
	// в холст/Шаги.os; скрипт ставит только data-steps-live, data-steps-done, aria-current,
	// hidden и open.

	var stepsAt = new WeakMap(); // корень шагов → номер текущей панели с нуля

	function stepsOwn(root, selector) {
		return root.querySelectorAll(':scope > ' + selector);
	}

	function stepsParts(root) {
		var bar = stepsOwn(root, '[data-steps-bar]')[0];
		var nav = stepsOwn(root, '.steps__nav')[0];
		var pick = function (name) {
			return nav ? nav.querySelector(':scope > [' + name + ']') : null;
		};
		return {
			bar: bar,
			items: bar ? bar.querySelectorAll(':scope > li') : [],
			panels: stepsOwn(root, '[data-steps-panel]'),
			back: pick('data-steps-back'),
			next: pick('data-steps-next'),
			submit: pick('data-steps-submit')
		};
	}

	// Мастер ведёт по порядку; вид «вкладки» (правка) печатается без «Дальше»: любой шаг
	// открывается сразу, отправка видна всегда.
	function stepsFree(parts) {
		return !parts.next;
	}

	function stepsShow(root, index, focus) {
		var parts = stepsParts(root);
		var last = parts.panels.length - 1;
		var free = stepsFree(parts);
		index = Math.max(0, Math.min(index, last));
		stepsAt.set(root, index);
		for (var i = 0; i <= last; i++) {
			parts.panels[i].open = true;
			parts.panels[i].hidden = i !== index;
			var item = parts.items[i];
			if (item) {
				if (i === index) {
					item.setAttribute('aria-current', 'step');
				} else {
					item.removeAttribute('aria-current');
				}
				item.toggleAttribute('data-steps-done', !free && i < index);
			}
		}
		if (parts.back) {
			parts.back.hidden = index === 0;
		}
		if (parts.next) {
			parts.next.hidden = index === last;
		}
		if (parts.submit) {
			parts.submit.hidden = !free && index !== last;
		}
		if (focus) {
			// фокус на панель: скринридер называет её «Шаг 2 из 3: Участники»
			var panel = parts.panels[index];
			panel.setAttribute('tabindex', '-1');
			panel.focus({ preventScroll: true });
			if (root.getBoundingClientRect().top < 0) {
				root.scrollIntoView({ block: 'start', behavior: calm && calm.matches ? 'auto' : 'smooth' });
			}
		}
	}

	// Годны ли поля панели. Первое негодное получает отказ браузера и фокус; поля
	// отключённой группы браузер не проверяет (willValidate).
	function stepsValid(panel) {
		var controls = panel.querySelectorAll('input, select, textarea');
		for (var i = 0; i < controls.length; i++) {
			if (controls[i].willValidate && !controls[i].checkValidity()) {
				controls[i].reportValidity();
				return false;
			}
		}
		return true;
	}

	// Вперёд мастер идёт через каждый шаг по дороге: прыжок с первого на третий по полосе
	// проверяет и второй, и останавливается на первом шаге с негодным полем.
	function stepsGo(root, target) {
		var parts = stepsParts(root);
		var current = stepsAt.has(root) ? stepsAt.get(root) : 0;
		target = Math.max(0, Math.min(target, parts.panels.length - 1));
		if (target === current) {
			return;
		}
		if (!stepsFree(parts) && target > current) {
			for (var i = current; i < target; i++) {
				if (i !== current) {
					stepsShow(root, i, false);
				}
				if (!stepsValid(parts.panels[i])) {
					return;
				}
			}
		}
		stepsShow(root, target, true);
	}

	// Шаг, с которого начать: тот, где у поля отказ сервера; иначе прежний (страницу
	// поменяла чужая тихая отправка — человек остаётся там, где был); иначе тот, что
	// назвал сервер (data-steps).
	function stepsStart(root) {
		var panels = stepsParts(root).panels;
		for (var i = 0; i < panels.length; i++) {
			if (panels[i].querySelector('[aria-invalid="true"]')) {
				return i;
			}
		}
		if (stepsAt.has(root)) {
			return stepsAt.get(root);
		}
		return (parseInt(root.getAttribute('data-steps'), 10) || 1) - 1;
	}

	function stepsInit(scope) {
		var roots = (scope || doc).querySelectorAll('[data-steps]');
		for (var i = 0; i < roots.length; i++) {
			var root = roots[i];
			var parts = stepsParts(root);
			if (!parts.panels.length) {
				continue;
			}
			root.setAttribute('data-steps-live', '');
			if (parts.bar) {
				parts.bar.hidden = false;
			}
			stepsShow(root, stepsStart(root), false);
		}
	}

	doc.addEventListener('click', function (e) {
		var hit = e.target.closest
			? e.target.closest('[data-steps-go], [data-steps-back] button, [data-steps-next] button')
			: null;
		var root = hit ? hit.closest('[data-steps-live]') : null;
		if (!root) {
			return;
		}
		var current = stepsAt.get(root) || 0;
		if (hit.hasAttribute('data-steps-go')) {
			stepsGo(root, (parseInt(hit.getAttribute('data-steps-go'), 10) || 1) - 1);
		} else if (hit.closest('[data-steps-back]')) {
			stepsGo(root, current - 1);
		} else {
			stepsGo(root, current + 1);
		}
	});

	// Enter в поле мастера — «Дальше», а не отправка всей формы с середины: кнопка
	// отправки ждёт последнего шага.
	doc.addEventListener('keydown', function (e) {
		var field = e.target;
		if (e.key !== 'Enter' || e.defaultPrevented || e.isComposing || !field
			|| field.tagName !== 'INPUT' || /^(button|submit|reset|checkbox|radio|file|image)$/.test(field.type)) {
			return;
		}
		var panel = field.closest('[data-steps-panel]');
		var root = panel ? panel.parentNode : null;
		if (!root || !root.hasAttribute || !root.hasAttribute('data-steps-live')) {
			return;
		}
		var parts = stepsParts(root);
		var current = stepsAt.get(root) || 0;
		if (stepsFree(parts) || current >= parts.panels.length - 1) {
			return;
		}
		e.preventDefault();
		stepsGo(root, current + 1);
	});

	// Отправка, чьё негодное поле лежит на скрытой панели (вид «вкладки»), открывает эту
	// панель: иначе браузер молча не отправил бы форму — показать отказ ему негде.
	var stepsReported = false;
	doc.addEventListener('invalid', function (e) {
		var panel = e.target.closest ? e.target.closest('[data-steps-panel]') : null;
		var root = panel ? panel.parentNode : null;
		if (stepsReported || !panel || !panel.hidden || !root.hasAttribute('data-steps-live')) {
			return;
		}
		stepsReported = true;
		var panels = stepsParts(root).panels;
		stepsShow(root, Array.prototype.indexOf.call(panels, panel), false);
		var control = e.target;
		setTimeout(function () {
			stepsReported = false;
			if (doc.activeElement !== control) {
				control.reportValidity();
			}
		}, 0);
	}, true);

	// Удачно отправленная форма сброшена тихой отправкой — её шаги начинаются сначала.
	doc.addEventListener('reset', function (e) {
		var roots = e.target.querySelectorAll ? e.target.querySelectorAll('[data-steps]') : [];
		for (var i = 0; i < roots.length; i++) {
			stepsAt.delete(roots[i]);
		}
	});

	// Морфинг ответа возвращает разметке серверный вид (hidden у полосы и кнопок):
	// шаги оживают заново.
	doc.addEventListener('oscript-ui:update', function () { stepsInit(); });
	stepsInit();
})();

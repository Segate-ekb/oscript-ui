/* oscript-ui — скрипт кита: движение Material по образцу MUI там, где одного CSS мало.
 *
 * ТОЛЬКО УЛУЧШЕНИЕ. Страница без этого файла работает целиком и выглядит законченной:
 * ссылки, формы, меню, окна и раскрывашки — разметка и движок браузера. Скрипт добавляет
 * четыре вещи и ничего не решает за сервер:
 *   1. рябь — круг от точки нажатия на кнопке, ссылке-пункте, вкладке, чипе;
 *   2. пустоту поля (data-empty) — по ней лист опускает подпись на место значения;
 *   3. признак прокрутки шапки (data-scrolled) — по нему шапка меняет цвет и даёт тень;
 *   4. имя перехода индикатора вкладок (data-vt) — по нему движок везёт индикатор
 *      со старой страницы на новую (View Transitions между документами);
 *   5. крестик закрываемого тоста — тост гаснет и уходит со страницы.
 *
 * Глобальных имён скрипт не заводит, разметку не печатает — только атрибуты и рябь.
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

	var tops = doc.querySelectorAll('.top');
	if (tops.length) {
		var ticking = false;
		var paint = function () {
			ticking = false;
			var scrolled = window.scrollY > 0;
			for (var i = 0; i < tops.length; i++) {
				tops[i].toggleAttribute('data-scrolled', scrolled);
			}
		};
		window.addEventListener('scroll', function () {
			if (!ticking) {
				ticking = true;
				requestAnimationFrame(paint);
			}
		}, { passive: true });
		paint();
	}

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
})();

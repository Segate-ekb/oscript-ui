/* Скрипт сайта документации: кнопка «Копировать» у блока кода кита (атрибут data-copy)
 * кладёт код в буфер обмена — ровно то, что делает у себя любая инсталляция. Без скрипта
 * код остаётся на странице видимым и выделяемым. */
(function () {
	'use strict';
	document.addEventListener('click', function (e) {
		var button = e.target.closest('[data-copy]');
		if (!button || !navigator.clipboard) {
			return;
		}
		navigator.clipboard.writeText(button.getAttribute('data-copy'));
		var label = button.querySelector('span');
		if (!label || label.textContent === 'Скопировано') {
			return;
		}
		var was = label.textContent;
		label.textContent = 'Скопировано';
		setTimeout(function () { label.textContent = was; }, 1500);
	});
})();

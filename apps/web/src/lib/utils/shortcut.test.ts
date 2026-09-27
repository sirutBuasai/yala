import { afterEach, describe, expect, it } from 'vitest';
import { isShortcut } from '$lib/utils/shortcut';

function press(target: Element, init: KeyboardEventInit = {}): KeyboardEvent {
	const e = new KeyboardEvent('keydown', { key: 'n', bubbles: true, ...init });
	Object.defineProperty(e, 'target', { value: target });
	return e;
}

describe('isShortcut', () => {
	afterEach(() => document.body.replaceChildren());

	it('takes a bare key pressed on the page', () => {
		expect(isShortcut(press(document.body))).toBe(true);
	});

	it('leaves a key typed into a field or an editable label alone', () => {
		const input = document.body.appendChild(document.createElement('input'));
		const label = document.body.appendChild(document.createElement('span'));
		label.setAttribute('contenteditable', 'plaintext-only');
		expect(isShortcut(press(input))).toBe(false);
		expect(isShortcut(press(label))).toBe(false);
	});

	it('leaves a chord, a held key, and anything behind an open dialog alone', () => {
		expect(isShortcut(press(document.body, { metaKey: true }))).toBe(false);
		expect(isShortcut(press(document.body, { repeat: true }))).toBe(false);
		document.body.appendChild(document.createElement('dialog')).setAttribute('open', '');
		expect(isShortcut(press(document.body))).toBe(false);
	});
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { live } from '$lib/data/load';
import { layoutStore, seedLayouts } from '$lib/data/layouts';
import { Pref, listOf, number, versioned } from '$lib/utils/persist.svelte';

function posted(spy: ReturnType<typeof vi.fn>): unknown[] {
	return spy.mock.calls
		.filter(([url]) => url === '/api/layout')
		.map(([, init]) => JSON.parse((init as RequestInit).body as string));
}

describe('layoutStore', () => {
	let fetchSpy: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		vi.useFakeTimers();
		localStorage.clear();
		fetchSpy = vi.fn(async () => new Response('{"ok": true}', { status: 200 }));
		vi.stubGlobal('fetch', fetchSpy);
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.unstubAllGlobals();
	});

	it('reads what the settings file held at load', () => {
		seedLayouts({ 'board-home': [{ id: 'a' }] });
		expect(layoutStore.read('board-home')).toEqual([{ id: 'a' }]);
	});

	it('shows a change at once and sends only the last of a burst to the file', async () => {
		layoutStore.write('labels-home', { a: { title: 'x' } });
		layoutStore.write('labels-home', { a: { title: 'xy' } });

		expect(layoutStore.read('labels-home')).toEqual({ a: { title: 'xy' } });
		expect(posted(fetchSpy)).toEqual([]);

		await vi.runAllTimersAsync();
		expect(posted(fetchSpy)).toEqual([{ key: 'labels-home', value: { a: { title: 'xy' } } }]);
	});

	it("adopts a layout arranged in this browser before layouts moved, then drops the browser's copy", async () => {
		localStorage.setItem('yala-board-home', JSON.stringify([{ id: 'b' }]));

		expect(layoutStore.read('board-home')).toEqual([{ id: 'b' }]);
		await vi.runAllTimersAsync();

		expect(posted(fetchSpy)).toEqual([{ key: 'board-home', value: [{ id: 'b' }] }]);
		expect(localStorage.getItem('yala-board-home')).toBeNull();
	});

	it('removes a layout from the file when it goes back to its default', async () => {
		seedLayouts({ 'board-home': [{ id: 'a' }] });
		layoutStore.remove('board-home');

		expect(layoutStore.read('board-home')).toBeUndefined();
		await vi.runAllTimersAsync();
		expect(posted(fetchSpy)).toEqual([{ key: 'board-home', value: null }]);
	});

	it('drops a browser layout that is only the default instead of adopting it', async () => {
		localStorage.setItem('yala-board-home', '[]');

		expect(
			new Pref<unknown[]>('board-home', [], listOf(number()), { store: layoutStore }).value
		).toEqual([]);
		await vi.runAllTimersAsync();

		expect(posted(fetchSpy)).toEqual([{ key: 'board-home', value: null }]);
	});

	it('drops a layout an older shape wrote instead of reading it', async () => {
		seedLayouts({ 'board-home': versioned([1], 1) });

		expect(
			new Pref<number[]>('board-home', [], listOf(number()), { store: layoutStore, version: 2 })
				.value
		).toEqual([]);
		await vi.runAllTimersAsync();

		expect(posted(fetchSpy)).toEqual([{ key: 'board-home', value: null }]);
	});

	it('keeps a change in this browser when there is no API to send it to', async () => {
		live.set(false);
		layoutStore.write('kpi-home', [1]);
		await vi.runAllTimersAsync();

		expect(fetchSpy).not.toHaveBeenCalled();
		expect(localStorage.getItem('yala-kpi-home')).toBe('[1]');
		expect(layoutStore.read('kpi-home')).toEqual([1]);
	});
});

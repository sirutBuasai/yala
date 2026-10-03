import { flushSync } from 'svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SettingsInfo } from '$lib/data/load';

const written: [string, number | null][] = [];
let stated: Record<string, number | null> = {};

vi.mock('$lib/data/load', () => ({
	getSettings: async () => ({ info: settings(), error: null }),
	setSetting: async (key: string, value: number | null) => {
		written.push([key, value]);
		return null;
	}
}));

const spec = (key: string, dflt: number | null, kind = 'money') => ({
	key,
	label: key,
	kind,
	min: 0,
	max: 1_000_000,
	default: dflt,
	help: ''
});

function settings(): SettingsInfo {
	return {
		values: stated,
		specs: [spec('planned-spending', null), spec('swr', 4, 'percent')]
	} as unknown as SettingsInfo;
}

const { PlanDraft } = await import('./draft.svelte');

/** A draft keeps itself with an effect, which needs an owner outside a component. */
function fresh(): InstanceType<typeof PlanDraft> {
	let draft!: InstanceType<typeof PlanDraft>;
	$effect.root(() => {
		draft = new PlanDraft();
	});
	return draft;
}

describe('PlanDraft', () => {
	beforeEach(() => {
		written.length = 0;
		stated = { 'planned-spending': 60_000, swr: 3 };
	});

	it('has nothing to save until a figure moves, and nothing again once it is saved', async () => {
		const draft = fresh();
		await draft.load();
		expect(draft.changed).toEqual([]);

		draft.set('swr', 3.5);
		expect(draft.changed.map((s) => s.key)).toEqual(['swr']);
		expect(await draft.commit()).toBe(true);
		expect(draft.changed).toEqual([]);
	});

	it('returns a stated figure to its default, which is saved as a reset', async () => {
		const draft = fresh();
		await draft.load();
		expect(draft.atDefault('planned-spending')).toBe(false);

		draft.set('planned-spending', null);
		expect(draft.atDefault('planned-spending')).toBe(true);
		expect(draft.changed.map((s) => s.key)).toEqual(['planned-spending']);

		await draft.commit();
		expect(written).toEqual([['planned-spending', null]]);
	});

	it('counts a figure stated as exactly its default as on the default', async () => {
		stated = { 'planned-spending': null, swr: 4 };
		const draft = fresh();
		await draft.load();
		expect(draft.atDefault('swr')).toBe(true);
		expect(draft.atDefault('planned-spending')).toBe(true);
	});

	it('brings unsaved figures back when the page is opened again', async () => {
		const left = fresh();
		await left.load();
		left.set('swr', 3.5);
		flushSync();

		const back = fresh();
		await back.load();
		expect(back.value('swr')).toBe(3.5);
		expect(back.changed.map((s) => s.key)).toEqual(['swr']);
	});
});

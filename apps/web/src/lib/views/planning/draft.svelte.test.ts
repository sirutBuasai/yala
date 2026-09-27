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

describe('PlanDraft', () => {
	beforeEach(() => {
		written.length = 0;
		stated = { 'planned-spending': 60_000, swr: 3 };
	});

	it('has nothing to save until a figure moves, and nothing again once it is saved', async () => {
		const draft = new PlanDraft();
		await draft.load();
		expect(draft.changed).toEqual([]);

		draft.set('swr', 3.5);
		expect(draft.changed.map((s) => s.key)).toEqual(['swr']);
		expect(await draft.commit()).toBe(true);
		expect(draft.changed).toEqual([]);
	});

	it('returns a stated figure to its default, which is saved as a reset', async () => {
		const draft = new PlanDraft();
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
		const draft = new PlanDraft();
		await draft.load();
		expect(draft.atDefault('swr')).toBe(true);
		expect(draft.atDefault('planned-spending')).toBe(true);
	});
});

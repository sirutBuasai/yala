// The planning assumptions as the form holds them. Nothing reaches the ledger until `commit`; until then
// every pane previews them through `preview`, so none can show a figure the controls no longer say.

import type { DashboardData } from '$lib/data/types';
import { getSettings, setSetting, type SettingsInfo } from '$lib/data/load';
import { withSettings } from '$lib/data/assumptions';
import { SAVED } from '$lib/copy';
import { SaveState } from '$lib/forms/saveState.svelte';
import { validateRange } from '$lib/forms/validate';

export class PlanDraft {
	info = $state<SettingsInfo | null>(null);
	loadError = $state('');
	loading = $state(true);
	/** Value per setting key as the form holds it. Null is a setting left at what the ledger states, which
	    is what keeps Save disabled until something is actually moved. */
	values = $state<Record<string, number | null>>({});
	readonly save = new SaveState();

	specs = $derived(this.info?.specs ?? []);
	changed = $derived(
		this.specs.filter((spec) => {
			const value = this.values[spec.key];
			return value != null && value !== this.info?.values[spec.key];
		})
	);

	async load(): Promise<void> {
		this.loading = true;
		const { info, error } = await getSettings();
		this.info = info;
		this.loadError = error ?? '';
		this.values = { ...(info?.values ?? {}) };
		this.loading = false;
	}

	set(key: string, value: number | null): void {
		this.values[key] = value;
		this.save.reset();
	}

	discard(): void {
		this.values = { ...(this.info?.values ?? {}) };
		this.save.reset();
	}

	preview(data: DashboardData): DashboardData {
		return withSettings(data, this.values);
	}

	/** Write every changed setting. True once all are written, when the ledger states the draft. */
	async commit(): Promise<boolean> {
		const changed = this.changed;
		for (const spec of changed) {
			const problem = validateRange(
				this.values[spec.key] ?? null,
				spec.label,
				spec.min,
				spec.max,
				spec.kind !== 'percent'
			);
			if (problem) return this.save.fail(problem);
		}

		// One request per setting, because per-key is what the API takes.
		const ok = await this.save.run(async () => {
			for (const spec of changed) {
				const problem = await setSetting(spec.key, this.values[spec.key]!);
				if (problem) return problem;
			}
			return null;
		}, SAVED);

		if (ok && this.info) {
			const written = Object.fromEntries(changed.map((spec) => [spec.key, this.values[spec.key]!]));
			this.info = { ...this.info, values: { ...this.info.values, ...written } };
		}
		return ok;
	}
}

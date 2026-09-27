// The planning assumptions as the form holds them. Nothing reaches the ledger until `commit`; until then
// every pane previews them through `preview`, so none can show a figure the controls no longer say.

import type { DashboardData } from '$lib/data/types';
import { getSettings, setSetting, type SettingsInfo } from '$lib/data/load';
import { withSettings } from '$lib/data/assumptions';
import { SaveState } from '$lib/forms/saveState.svelte';
import { validateRange } from '$lib/forms/validate';

export class PlanDraft {
	info = $state<SettingsInfo | null>(null);
	loadError = $state('');
	loading = $state(true);
	/** Value per setting key as the form holds it, starting from what the ledger states. Null is a setting
	    on its default, which for a figure derived from the ledger means following the ledger as it grows. */
	values = $state<Record<string, number | null>>({});
	readonly save = new SaveState();

	specs = $derived(this.info?.specs ?? []);
	changed = $derived(
		this.specs.filter((spec) => this.value(spec.key) !== (this.info?.values[spec.key] ?? null))
	);

	/** A setting as the form holds it, null when it is on its default. */
	value(key: string): number | null {
		return this.values[key] ?? null;
	}

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

	/** Whether a setting follows its default: unset, or stated as exactly the default. */
	atDefault(key: string): boolean {
		const value = this.value(key);
		return value === null || value === this.specs.find((spec) => spec.key === key)?.default;
	}

	discard(): void {
		this.values = { ...(this.info?.values ?? {}) };
		this.save.reset();
	}

	preview(data: DashboardData): DashboardData {
		return withSettings(data, this.values);
	}

	/** Write every changed setting, a null one as a return to its default. True once all are written, when
	    the ledger states the draft. */
	async commit(): Promise<boolean> {
		const changed = this.changed;
		for (const spec of changed) {
			const value = this.value(spec.key);
			if (value === null) continue;
			const problem = validateRange(value, spec.label, spec.min, spec.max, spec.kind !== 'percent');
			if (problem) return this.save.fail(problem);
		}

		// One request per setting, because per-key is what the API takes.
		const ok = await this.save.run(async () => {
			for (const spec of changed) {
				const problem = await setSetting(spec.key, this.value(spec.key));
				if (problem) return problem;
			}
			return null;
		});

		if (ok && this.info) {
			const written = Object.fromEntries(changed.map((spec) => [spec.key, this.value(spec.key)]));
			this.info = { ...this.info, values: { ...this.info.values, ...written } };
		}
		return ok;
	}
}

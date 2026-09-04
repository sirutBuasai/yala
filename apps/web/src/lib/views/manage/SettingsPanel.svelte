<script lang="ts">
	// The assumptions the ledger can't derive — a withdrawal rate, a target age. Fetched with their
	// specs so this panel lists whatever the backend defines rather than hardcoding a field per
	// setting: adding a setting server-side makes it appear here.
	import { getSettings, type SettingsInfo } from '$lib/data/load';
	import SettingField from '$lib/views/manage/SettingField.svelte';

	interface Props {
		/** Called after a save, so the dashboard's derived figures pick the new value up. */
		onsaved?: () => void;
	}
	let { onsaved }: Props = $props();

	let info = $state<SettingsInfo | null>(null);
	let error = $state('');
	let loading = $state(true);

	async function load() {
		loading = true;
		const { info: loaded, error: problem } = await getSettings();
		info = loaded;
		error = problem ?? '';
		loading = false;
	}

	// One-shot on mount. Kept out of an $effect body's dependency graph deliberately: the fetch
	// writes the state it would otherwise be seen to read.
	$effect(() => {
		void load();
	});

	function saved(key: string, value: number) {
		if (info) info.values = { ...info.values, [key]: value };
		onsaved?.();
	}
</script>

{#if info}
	{#each info.specs as spec (spec.key)}
		<SettingField {spec} value={info.values[spec.key] ?? null} onsaved={saved} />
	{/each}
{:else if loading}
	<p class="hint">Loading…</p>
{:else}
	<p class="err" role="alert">{error}</p>
	<button type="button" class="btn-accent" onclick={load}>Try again</button>
{/if}

<style>
	.hint {
		color: var(--ink-3);
		font-size: var(--text-subtitle);
		margin: 0;
	}
	.err {
		color: var(--crit-text);
		font-size: var(--text-subtitle);
		margin: 0 0 var(--gap-row);
	}
</style>

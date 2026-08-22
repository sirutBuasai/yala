<script lang="ts">
	import { mode, enableEditMode, disableEditMode } from '$lib/data';

	let { onhint }: { onhint: (msg: string) => void } = $props();
	let busy = $state(false);

	async function toggle() {
		if (busy) return;
		busy = true;
		if ($mode === 'edit') {
			await disableEditMode();
		} else {
			const ok = await enableEditMode();
			if (!ok) {
				onhint(
					'Edit mode needs the local API — run `python -m yala.api` (then retry). Staying in view mode.'
				);
			}
		}
		busy = false;
	}
</script>

<button class="tgl" class:on={$mode === 'edit'} onclick={toggle} disabled={busy}>
	{$mode === 'edit' ? '✎ Editing' : '✎ Edit'}
</button>

<style>
	.tgl {
		border: 1px solid var(--border);
		background: var(--surface);
		color: var(--ink-2);
		border-radius: 999px;
		padding: 8px 14px;
		font-size: 12.5px;
		cursor: pointer;
		box-shadow: var(--shadow);
	}
	.tgl:hover {
		color: var(--ink);
		border-color: var(--lav);
	}
	.tgl.on {
		background: color-mix(in srgb, var(--lav) 20%, transparent);
		color: var(--ink);
		border-color: var(--lav);
	}
</style>

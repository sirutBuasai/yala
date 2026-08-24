<script lang="ts">
	import { mode, enableEditMode, disableEditMode } from '$lib/data/load';

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

<button class="pill" class:active={$mode === 'edit'} onclick={toggle} disabled={busy}>
	{$mode === 'edit' ? '✎ Editing' : '✎ Edit'}
</button>

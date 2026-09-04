<script lang="ts">
	import { mode, enableEditMode, disableEditMode } from '$lib/data/load';

	interface Props {
		onhint: (msg: string) => void;
		/** The mode the user asked for — the only thing worth persisting. A failed attempt to enter
		    edit mode is not a choice to stay in view, so it is deliberately not reported. */
		onchosen?: (chosen: 'edit' | 'view') => void;
	}
	let { onhint, onchosen }: Props = $props();
	let busy = $state(false);

	async function toggle() {
		if (busy) return;
		busy = true;
		if ($mode === 'edit') {
			await disableEditMode();
			onchosen?.('view');
		} else if (await enableEditMode()) {
			onchosen?.('edit');
		} else {
			onhint(
				'Edit mode needs the local API — run `python -m yala.api` (then retry). Staying in view mode.'
			);
		}
		busy = false;
	}
</script>

<button class="pill" class:active={$mode === 'edit'} onclick={toggle} disabled={busy}>
	{$mode === 'edit' ? '✎ Editing' : '✎ Edit'}
</button>

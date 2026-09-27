<script lang="ts">
	// The one save button: its label says whether there is anything to write, so no status line is needed
	// beside it.
	import { SAVE_CHANGES, SAVED, SAVING } from '$lib/copy';

	interface Props {
		/** Something differs from what is stored. */
		dirty: boolean;
		busy?: boolean;
		/** Held off for a reason of the caller's own, such as settings that have not loaded. */
		disabled?: boolean;
		onclick: () => void;
	}
	let { dirty, busy = false, disabled = false, onclick }: Props = $props();
</script>

<button type="button" class="btn-primary" disabled={disabled || busy || !dirty} {onclick}
	>{busy ? SAVING : dirty ? SAVE_CHANGES : SAVED}</button
>

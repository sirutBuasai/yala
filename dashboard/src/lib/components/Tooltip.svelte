<script lang="ts">
	import { tip } from '$lib/tooltip';

	let w = $state(0);
	let h = $state(0);
	let vw = $state(0);
	let vh = $state(0);

	// Offset from the cursor, flipping to the other side near the viewport edge.
	const left = $derived($tip.x + 12 + w > vw ? $tip.x - w - 12 : $tip.x + 12);
	const top = $derived($tip.y + 12 + h > vh ? $tip.y - h - 12 : $tip.y + 12);
</script>

<svelte:window bind:innerWidth={vw} bind:innerHeight={vh} />

<div
	class="tooltip"
	bind:clientWidth={w}
	bind:clientHeight={h}
	style:left="{left}px"
	style:top="{top}px"
	style:opacity={$tip.visible ? 1 : 0}
	style:transition="opacity .09s"
>
	{@html $tip.html}
</div>

<script lang="ts">
	// The "pick this up and move it" mark, used by the pane grid's drag handle. Dots rather than a stroked
	// glyph so it reads as texture and doesn't compete with the pane title beside it.
	import Icon from './Icon.svelte';

	interface Props {
		size?: number;
	}
	let { size = 14 }: Props = $props();

	const COLUMNS = [5.5, 10.5];
	const ROWS = [4, 8, 12];
</script>

<Icon {size} filled>
	{#each COLUMNS as cx (cx)}
		{#each ROWS as cy (cy)}
			<circle {cx} {cy} r="1.35" />
		{/each}
	{/each}
</Icon>

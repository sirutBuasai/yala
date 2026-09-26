<script lang="ts">
	// One figure shown as fully as its box allows. The most compact reading always holds the figure's place
	// and is what a pane's floor is judged on (`data-clip`, D43); a fuller one, when `level` picks it, is laid
	// over it rather than in the flow, so it never decides how narrow the pane may go. `fitReadings` picks
	// the level from the widths the probe lays out.
	interface Props {
		/** Fullest first. */
		readings: string[];
		/** Which reading to show; the most compact when out of range. */
		level: number;
		/** The set of figures `fitReadings` picks one level for, where a box holds more than one. */
		group?: string;
	}
	let { readings, level, group = '' }: Props = $props();

	const last = $derived(readings.length - 1);
	const shown = $derived(Math.min(level, last));
</script>

<span class="reading" data-reading={group}>
	<span class="floor" class:covered={shown < last} data-clip>{readings[last]}</span>
	{#if shown < last}<span class="full">{readings[shown]}</span>{/if}
	<span class="probe" aria-hidden="true">
		{#each readings as r, i (i)}<span>{r}</span>{/each}
	</span>
</span>

<style>
	.reading {
		position: relative;
		display: block;
		min-width: 0;
	}
	.floor {
		display: block;
		overflow: hidden;
		white-space: nowrap;
	}
	.covered {
		visibility: hidden;
	}
	/* Aligned with the text it covers, whichever side that sits on. */
	.full {
		position: absolute;
		inset: 0;
		white-space: nowrap;
		text-align: inherit;
	}
	/* Laid out but unpainted and zero-sized, as every probe here: a sized one reads as a spill. */
	.probe {
		position: absolute;
		top: 0;
		left: 0;
		width: 0;
		height: 0;
		overflow: hidden;
		visibility: hidden;
		white-space: nowrap;
	}
	.probe span {
		display: inline-block;
	}
</style>

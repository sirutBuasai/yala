<script module lang="ts">
	export interface Key {
		name: string;
		color: string;
		/** Drawn as a dashed rule rather than a solid block, so the key matches the mark. */
		dashed?: boolean;
	}
</script>

<script lang="ts">
	// The keys above (or below) a chart. Every chart that names its series renders this, so swatch
	// size, order and the dashed variant can't drift between them; the styles are the shared
	// `.legend > .k > .sw` rules in app.css.
	interface Props {
		keys: Key[];
		/** Key underneath the plot instead of above it. */
		below?: boolean;
		/** Reverse the keys, for a chart whose first series is drawn at the bottom. */
		reverse?: boolean;
	}
	let { keys, below = false, reverse = false }: Props = $props();

	const shown = $derived(reverse ? keys.slice().reverse() : keys);
	const dashes = (color: string) =>
		`repeating-linear-gradient(90deg, ${color} 0 4px, transparent 4px 7px)`;
</script>

<div class="legend" class:below>
	{#each shown as k (k.name)}
		<span class="k">
			<span class="sw" class:dash={k.dashed} style:background={k.dashed ? dashes(k.color) : k.color}
			></span>{k.name}
		</span>
	{/each}
</div>

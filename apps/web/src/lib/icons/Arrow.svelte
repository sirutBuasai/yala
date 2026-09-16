<script lang="ts">
	// A directional arrow: shaft plus head.
	import Icon from './Icon.svelte';

	interface Props {
		dir: 'up' | 'down';
		size?: number;
	}
	let { dir, size = 14 }: Props = $props();

	const d = $derived(dir === 'up' ? 'M8 13V3M4.5 6.5 8 3l3.5 3.5' : 'M8 3v10M4.5 9.5 8 13l3.5-3.5');
</script>

<Icon {size}>
	<path {d} />
</Icon>

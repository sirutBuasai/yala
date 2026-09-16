<script lang="ts">
	// A directional chevron, used by the period steppers.
	import Icon from './Icon.svelte';

	interface Props {
		dir: 'left' | 'right';
		size?: number;
	}
	let { dir, size = 14 }: Props = $props();

	const d = $derived(dir === 'left' ? 'M10 3.5 5.5 8 10 12.5' : 'M6 3.5 10.5 8 6 12.5');
</script>

<Icon {size} weight={1.7}>
	<path {d} />
</Icon>

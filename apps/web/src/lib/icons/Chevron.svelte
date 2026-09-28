<script lang="ts">
	// A directional chevron: the period steppers point sideways, a dropdown points down.
	import Icon from './Icon.svelte';

	type Dir = 'left' | 'right' | 'up' | 'down';

	interface Props {
		dir: Dir;
		size?: number;
	}
	let { dir, size = 14 }: Props = $props();

	const PATHS: Record<Dir, string> = {
		left: 'M10 3.5 5.5 8 10 12.5',
		right: 'M6 3.5 10.5 8 6 12.5',
		up: 'M3.5 10 8 5.5 12.5 10',
		down: 'M3.5 6 8 10.5 12.5 6'
	};
</script>

<Icon {size} weight={1.7}>
	<path d={PATHS[dir]} />
</Icon>

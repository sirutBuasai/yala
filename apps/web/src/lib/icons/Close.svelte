<script lang="ts">
	// A dismissal cross. Drawn rather than a text "✕", which never centres in a button.
	import Icon from './Icon.svelte';

	interface Props {
		size?: number;
	}
	let { size = 14 }: Props = $props();
</script>

<Icon {size}>
	<path d="M4 4l8 8M12 4l-8 8" />
</Icon>

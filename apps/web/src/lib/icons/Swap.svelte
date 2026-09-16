<script lang="ts">
	// Two opposed vertical arrows — a value moving between two accounts (a bill pay or transfer).
	import Icon from './Icon.svelte';

	interface Props {
		size?: number;
	}
	let { size = 14 }: Props = $props();
</script>

<Icon {size}>
	<path d="M5.5 12V4M3.5 6 5.5 4 7.5 6M10.5 4v8M8.5 10 10.5 12 12.5 10" />
</Icon>

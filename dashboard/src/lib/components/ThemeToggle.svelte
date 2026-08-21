<script lang="ts">
	import { theme, toggleTheme } from '$lib/theme';
</script>

<button class="tgl" onclick={toggleTheme} title="Toggle light / dark">
	{$theme === 'light' ? '◑ Dark' : '◐ Light'}
</button>

<style>
	.tgl {
		border: 1px solid var(--border);
		background: var(--surface);
		color: var(--ink-2);
		border-radius: 999px;
		padding: 8px 14px;
		font-size: 12.5px;
		cursor: pointer;
		box-shadow: var(--shadow);
	}
	.tgl:hover {
		color: var(--ink);
		border-color: var(--lav);
	}
</style>

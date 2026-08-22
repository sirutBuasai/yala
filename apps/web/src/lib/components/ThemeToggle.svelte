<script lang="ts">
	import { theme, toggleTheme } from '$lib/theme';
</script>

<button class="pill" onclick={toggleTheme} title="Toggle light / dark">
	{$theme === 'light' ? '◑ Dark' : '◐ Light'}
</button>

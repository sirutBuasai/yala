<script lang="ts">
	import { theme, toggleTheme } from '$lib/utils/theme';
</script>

<button
	class="pill"
	onclick={toggleTheme}
	aria-label={$theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme'}
	title="Toggle light / dark"
>
	<span aria-hidden="true">{$theme === 'light' ? '◑ Dark' : '◐ Light'}</span>
</button>

<script lang="ts">
	// Throwaway sandbox for trying out components, charts, and DOM. Self-contained: it only
	// depends on the shared stylesheet and the NavMenu, so this whole `dev/` folder can be
	// deleted at the end without touching any production code.
	import '../../app.css';
	import NavMenu from '$lib/components/NavMenu.svelte';
</script>

<div class="wrap">
	<NavMenu />
	<header class="top">
		<div class="left">
			<a href="/" class="brand">
				<span class="dot"></span>
				<h1 class="serif">Yala</h1>
			</a>
			<span class="sub">development sandbox</span>
		</div>
	</header>

	<div class="playground">This is a development page.</div>
</div>

<style>
	.top {
		display: flex;
		align-items: center;
		gap: 16px;
		flex-wrap: wrap;
		margin-bottom: 20px;
	}
	.left {
		display: flex;
		align-items: center;
		gap: 12px;
		flex-wrap: wrap;
	}
	.brand {
		display: flex;
		align-items: baseline;
		gap: 12px;
		text-decoration: none;
		color: inherit;
		cursor: pointer;
	}
	.brand:hover h1 {
		color: var(--lav-text);
	}
	.brand h1 {
		font-size: 26px;
		margin: 0;
		font-weight: 600;
		letter-spacing: -0.3px;
	}
	.brand .dot {
		width: 9px;
		height: 9px;
		border-radius: 50%;
		background: var(--lav);
		box-shadow: 0 0 0 4px color-mix(in srgb, var(--lav) 20%, transparent);
		align-self: center;
	}
	.sub {
		color: var(--ink-3);
		font-size: 12.5px;
	}
	.playground {
		color: var(--ink-2);
		font-size: 15px;
	}
</style>

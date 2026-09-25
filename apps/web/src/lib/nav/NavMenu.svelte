<script lang="ts">
	// Hamburger that slides in a left sidebar. It must stay INLINE in the page header: as
	// `position: fixed` in the page's left gutter it forced an asymmetric `padding-left` on the column
	// at narrower widths, which pulled the pane grid off its own dot lattice.
	import { CLOSE_MENU } from '$lib/copy';
	import { modal } from '$lib/overlay/modal';
	import { dur } from '$lib/utils/motion';
	import Close from '$lib/icons/Close.svelte';
	import NavLinks from '$lib/nav/NavLinks.svelte';
	import { DEV_PAGE, PAGES } from '$lib/nav/pages';
	import { SIDEBAR_W } from '$lib/nav/sidebar';

	let open = $state(false);

	const links = [...PAGES, DEV_PAGE];

	function close() {
		open = false;
	}
</script>

<button class="burger" aria-label="Open menu" aria-expanded={open} onclick={() => (open = true)}>
	<svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
		<line x1="3" y1="6.5" x2="19" y2="6.5" />
		<line x1="3" y1="11" x2="19" y2="11" />
		<line x1="3" y1="15.5" x2="19" y2="15.5" />
	</svg>
</button>

{#if open}
	<!-- Esc, the scrim, focus restoration and making the page behind inert are all the dialog's own (see
	     overlay/modal), so this no longer listens on the window or renders a backdrop element. -->
	<dialog class="sheet" aria-label={CLOSE_MENU} use:modal={{ onclose: close, closeMs: dur(220) }}>
		<div class="sidebar" style:width="{SIDEBAR_W}px">
			<div class="head">
				<span class="serif title">Yala</span>
				<!-- data-dismiss so the sidebar opens focused on its first LINK, not on close. -->
				<button class="close iconbtn" data-dismiss aria-label={CLOSE_MENU} onclick={close}>
					<Close size={16} />
				</button>
			</div>
			<NavLinks {links} ariaLabel="Pages" onclick={close} />
		</div>
	</dialog>
{/if}

<style>
	.burger {
		display: grid;
		place-items: center;
		width: 30px;
		height: 30px;
		padding: 0;
		border: 0;
		background: none;
		color: var(--ink-2);
		cursor: pointer;
	}
	.burger:hover {
		color: var(--ink);
	}
	.burger svg line {
		stroke: currentColor;
		stroke-width: 2;
		stroke-linecap: round;
	}
	/* The whole sheet dismisses on a press, so it carries the pointer; the sidebar takes it back below.
	   Its reset and scrim are the shared `.sheet` (app.css). */
	.sheet {
		cursor: pointer;
	}
	.sidebar {
		position: fixed;
		top: 0;
		left: 0;
		height: 100%;
		cursor: auto;
		transition: translate 220ms;
		display: flex;
		flex-direction: column;
		gap: var(--gap-row);
		/* No horizontal padding: children set their own, so the full-width hover reaches the edges. */
		padding: var(--space-8) 0;
		background: var(--surface);
		border-right: 1px solid var(--border);
		box-shadow: var(--shadow);
	}
	@starting-style {
		.sheet[open] .sidebar {
			translate: -300px 0;
		}
	}
	.sheet:global(.closing) .sidebar {
		translate: -300px 0;
	}
	.head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--space-2) var(--space-9) var(--space-6);
		margin-bottom: var(--space-3);
		border-bottom: 1px solid var(--border);
	}
	.head .title {
		font-size: var(--text-dialog);
		font-weight: var(--fw-semibold);
		letter-spacing: var(--ls-tight);
	}
</style>

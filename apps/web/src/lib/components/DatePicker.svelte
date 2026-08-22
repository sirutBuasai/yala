<script lang="ts">
	// On-brand replacement for <input type="date">: a trigger button + a fixed-positioned
	// calendar popup (fixed so it escapes Modal/Drawer overflow). Value is an ISO "YYYY-MM-DD"
	// string (empty = unset). Keyboard: arrows move the day, Enter selects, Esc closes.
	import { MONTHS } from '$lib/format';

	interface Props {
		/** ISO date "YYYY-MM-DD" or '' (bindable). */
		value: string;
		id?: string;
		ariaLabel?: string;
		placeholder?: string;
	}
	let {
		value = $bindable(''),
		id,
		ariaLabel = 'Date',
		placeholder = 'yyyy-mm-dd'
	}: Props = $props();

	const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

	let open = $state(false);
	let placement = $state<'below' | 'above'>('below');
	let trigger = $state<HTMLButtonElement>();
	let popEl = $state<HTMLDivElement>();
	let pos = $state({ top: 0, left: 0 });

	let viewY = $state(2000);
	let viewM = $state(0); // 0-based
	let active = $state(''); // ISO of the keyboard-focused day

	const EST_HEIGHT = 320;

	function parse(v: string): { y: number; m: number; d: number } | null {
		const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
		return m ? { y: +m[1], m: +m[2] - 1, d: +m[3] } : null;
	}
	function iso(y: number, m: number, d: number) {
		return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
	}
	function display(v: string) {
		const p = parse(v);
		return p ? `${MONTHS[p.m]} ${p.d}, ${p.y}` : '';
	}

	function place() {
		if (!trigger) return;
		const r = trigger.getBoundingClientRect();
		const below = window.innerHeight - r.bottom;
		placement = below < EST_HEIGHT && r.top > below ? 'above' : 'below';
		pos = { top: placement === 'below' ? r.bottom + 4 : r.top - 4, left: r.left };
	}
	function openCal() {
		const p = parse(value);
		const now = new Date();
		viewY = p ? p.y : now.getFullYear();
		viewM = p ? p.m : now.getMonth();
		active = p ? value : iso(now.getFullYear(), now.getMonth(), now.getDate());
		place();
		open = true;
	}
	function close() {
		open = false;
	}
	function prevMonth() {
		if (viewM === 0) {
			viewM = 11;
			viewY -= 1;
		} else viewM -= 1;
	}
	function nextMonth() {
		if (viewM === 11) {
			viewM = 0;
			viewY += 1;
		} else viewM += 1;
	}
	function pick(isoStr: string) {
		value = isoStr;
		close();
		trigger?.focus();
	}
	function today() {
		const n = new Date();
		pick(iso(n.getFullYear(), n.getMonth(), n.getDate()));
	}
	function clear() {
		value = '';
		close();
		trigger?.focus();
	}

	// Grid of the visible month: leading blanks + each day.
	const grid = $derived.by(() => {
		const first = new Date(viewY, viewM, 1).getDay(); // 0=Sun
		const days = new Date(viewY, viewM + 1, 0).getDate();
		const cells: (string | null)[] = [];
		for (let i = 0; i < first; i++) cells.push(null);
		for (let d = 1; d <= days; d++) cells.push(iso(viewY, viewM, d));
		return cells;
	});

	function shiftActive(deltaDays: number) {
		const p = parse(active) ?? { y: viewY, m: viewM, d: 1 };
		const dt = new Date(p.y, p.m, p.d + deltaDays);
		active = iso(dt.getFullYear(), dt.getMonth(), dt.getDate());
		viewY = dt.getFullYear();
		viewM = dt.getMonth();
	}
	function onKey(e: KeyboardEvent) {
		if (!open) {
			if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
				e.preventDefault();
				openCal();
			}
			return;
		}
		if (e.key === 'Escape') {
			e.preventDefault();
			close();
			trigger?.focus();
		} else if (e.key === 'ArrowLeft') {
			e.preventDefault();
			shiftActive(-1);
		} else if (e.key === 'ArrowRight') {
			e.preventDefault();
			shiftActive(1);
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			shiftActive(-7);
		} else if (e.key === 'ArrowDown') {
			e.preventDefault();
			shiftActive(7);
		} else if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			if (active) pick(active);
		}
	}

	$effect(() => {
		if (!open) return;
		const onDown = (e: PointerEvent) => {
			const t = e.target as Node;
			if (trigger && !trigger.contains(t) && popEl && !popEl.contains(t)) close();
		};
		// Re-anchor on scroll/resize instead of closing; ignore scrolls inside the popup.
		const onScroll = (e: Event) => {
			const t = e.target as Node;
			if (popEl && t && popEl.contains(t)) return;
			place();
		};
		document.addEventListener('pointerdown', onDown, true);
		window.addEventListener('scroll', onScroll, true);
		window.addEventListener('resize', place);
		return () => {
			document.removeEventListener('pointerdown', onDown, true);
			window.removeEventListener('scroll', onScroll, true);
			window.removeEventListener('resize', place);
		};
	});
</script>

<button
	{id}
	bind:this={trigger}
	type="button"
	class="trigger"
	aria-haspopup="dialog"
	aria-expanded={open}
	aria-label={ariaLabel}
	onclick={() => (open ? close() : openCal())}
	onkeydown={onKey}
>
	<span class="val" class:placeholder={!value}>{value ? display(value) : placeholder}</span>
	<svg class="cal" width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
		<rect
			x="2"
			y="3"
			width="12"
			height="11"
			rx="2"
			fill="none"
			stroke="currentColor"
			stroke-width="1.3"
		/>
		<path d="M2 6h12M5 1.5v3M11 1.5v3" fill="none" stroke="currentColor" stroke-width="1.3" />
	</svg>
</button>

{#if open}
	<div
		bind:this={popEl}
		class="cal-pop {placement}"
		role="dialog"
		aria-label="Choose date"
		tabindex="-1"
		style="top:{pos.top}px; left:{pos.left}px;"
	>
		<div class="cal-head">
			<button type="button" class="nav" aria-label="Previous month" onclick={prevMonth}>‹</button>
			<span class="mlabel">{MONTHS[viewM]} {viewY}</span>
			<button type="button" class="nav" aria-label="Next month" onclick={nextMonth}>›</button>
		</div>
		<div class="dow">
			{#each WEEKDAYS as w, i (i)}<span>{w}</span>{/each}
		</div>
		<div class="days" role="grid">
			{#each grid as cell, i (i)}
				{#if cell}
					<button
						type="button"
						class="day"
						class:sel={cell === value}
						class:hl={cell === active}
						aria-current={cell === value ? 'date' : undefined}
						onpointerenter={() => (active = cell)}
						onclick={() => pick(cell)}>{+cell.slice(8)}</button
					>
				{:else}
					<span class="day empty"></span>
				{/if}
			{/each}
		</div>
		<div class="cal-foot">
			<button type="button" class="mini" onclick={today}>Today</button>
			<button type="button" class="mini" onclick={clear}>Clear</button>
		</div>
	</div>
{/if}

<style>
	.trigger {
		display: inline-flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		width: 100%;
		background-color: var(--inset);
		border: 1px solid var(--border);
		color: var(--ink);
		border-radius: 9px;
		padding: 7px 12px;
		font-size: 13px;
		font-family: inherit;
		cursor: pointer;
		text-align: left;
	}
	.trigger:focus-visible {
		outline: none;
		border-color: var(--lav);
		box-shadow: 0 0 0 2px color-mix(in srgb, var(--lav) 30%, transparent);
	}
	.val {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.val.placeholder {
		color: var(--ink-3);
	}
	.cal {
		flex: 0 0 auto;
		color: var(--ink-2);
	}
	.cal-pop {
		position: fixed;
		z-index: 70;
		width: 248px;
		padding: 12px;
		background: var(--surface-2);
		border: 1px solid var(--border);
		border-radius: 12px;
		box-shadow: var(--shadow);
	}
	.cal-pop.above {
		transform: translateY(-100%);
	}
	.cal-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 8px;
	}
	.mlabel {
		font-size: 13px;
		font-weight: 600;
		color: var(--ink);
	}
	.nav {
		background: none;
		border: 1px solid var(--border);
		color: var(--ink-2);
		border-radius: 7px;
		width: 26px;
		height: 26px;
		cursor: pointer;
		font-size: 15px;
		line-height: 1;
	}
	.nav:hover {
		border-color: var(--lav);
		color: var(--ink);
	}
	.dow,
	.days {
		display: grid;
		grid-template-columns: repeat(7, 1fr);
		gap: 2px;
	}
	.dow span {
		text-align: center;
		font-size: 10.5px;
		color: var(--ink-3);
		padding: 2px 0;
	}
	.day {
		aspect-ratio: 1;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		background: none;
		border: 0;
		border-radius: 7px;
		color: var(--ink);
		font-size: 12.5px;
		font-family: inherit;
		cursor: pointer;
	}
	.day.empty {
		cursor: default;
	}
	.day.hl {
		background: color-mix(in srgb, var(--lav) 20%, transparent);
	}
	.day.sel {
		background: var(--lav);
		color: #1a1522;
		font-weight: 700;
	}
	.cal-foot {
		display: flex;
		justify-content: space-between;
		margin-top: 10px;
	}
	.mini {
		background: none;
		border: 1px solid var(--border);
		color: var(--ink-2);
		border-radius: 7px;
		padding: 4px 10px;
		cursor: pointer;
		font-size: 11.5px;
	}
	.mini:hover {
		border-color: var(--lav);
		color: var(--ink);
	}
</style>

<script lang="ts">
	// On-brand replacement for <input type="date">: a Popup-hosted calendar. Value is an ISO
	// "YYYY-MM-DD" string (empty = unset). Keyboard: arrows move the day, Enter selects, Esc closes.
	import { MONTHS } from '$lib/format';
	import Popup from './Popup.svelte';

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
	let triggerEl = $state<HTMLButtonElement>();
	let viewY = $state(2000);
	let viewM = $state(0);
	let active = $state(''); // ISO of the keyboard-focused day

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

	function seedView() {
		const p = parse(value);
		const now = new Date();
		viewY = p ? p.y : now.getFullYear();
		viewM = p ? p.m : now.getMonth();
		active = p ? value : iso(now.getFullYear(), now.getMonth(), now.getDate());
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
		open = false;
		triggerEl?.focus();
	}
	function today() {
		const n = new Date();
		pick(iso(n.getFullYear(), n.getMonth(), n.getDate()));
	}
	function clear() {
		value = '';
		open = false;
		triggerEl?.focus();
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
	function onkeynav(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			e.preventDefault();
			open = false;
			triggerEl?.focus();
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
</script>

<Popup
	bind:open
	bind:triggerEl
	{id}
	{ariaLabel}
	popupRole="dialog"
	estHeight={320}
	onopen={seedView}
	{onkeynav}
>
	{#snippet trigger()}
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
	{/snippet}

	{#snippet children()}
		<div class="cal-pop" role="dialog" aria-label="Choose date" tabindex="-1">
			<div class="cal-head">
				<button type="button" class="nav" aria-label="Previous month" onclick={prevMonth}>
					<svg width="13" height="13" viewBox="0 0 16 16" aria-hidden="true">
						<path
							d="M10 3.5 5.5 8 10 12.5"
							fill="none"
							stroke="currentColor"
							stroke-width="1.7"
							stroke-linecap="round"
							stroke-linejoin="round"
						/>
					</svg>
				</button>
				<span class="mlabel">{MONTHS[viewM]} {viewY}</span>
				<button type="button" class="nav" aria-label="Next month" onclick={nextMonth}>
					<svg width="13" height="13" viewBox="0 0 16 16" aria-hidden="true">
						<path
							d="M6 3.5 10.5 8 6 12.5"
							fill="none"
							stroke="currentColor"
							stroke-width="1.7"
							stroke-linecap="round"
							stroke-linejoin="round"
						/>
					</svg>
				</button>
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
				<button type="button" class="btn-mini" onclick={today}>Today</button>
				<button type="button" class="btn-mini" onclick={clear}>Clear</button>
			</div>
		</div>
	{/snippet}
</Popup>

<style>
	.cal {
		flex: 0 0 auto;
		color: var(--ink-2);
	}
	.cal-pop {
		width: 248px;
		padding: 12px;
		background: var(--surface-2);
		border: 1px solid var(--border);
		border-radius: 12px;
		box-shadow: var(--shadow);
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
		display: flex;
		align-items: center;
		justify-content: center;
		background: none;
		border: 1px solid var(--border);
		color: var(--ink-2);
		border-radius: 7px;
		width: 26px;
		height: 26px;
		padding: 0;
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
		color: var(--on-accent);
		font-weight: 700;
	}
	.cal-foot {
		display: flex;
		justify-content: space-between;
		margin-top: 10px;
	}
</style>

<script lang="ts">
	// With `fit`, the smallest parts roll into `Other` until the key fits on one line.
	import {
		formatUnit,
		readingsOf,
		type Categorical,
		type CategoricalPoint
	} from '$lib/data/primitives';
	import { fitReadings } from '$lib/ui/readings';
	import Reading from '$lib/ui/Reading.svelte';
	import { rollup } from '$lib/data/categorical';
	import { keyColor, type ColorBy } from '$lib/charts/registry';
	import { chartFormat } from '$lib/charts/format';
	import { esc } from '$lib/utils/format';
	import { sumBy } from '$lib/utils/num';
	import { showTip, hideTip } from '$lib/utils/tooltip';
	import { drawnScale, watchWidth } from '$lib/ui/fit';
	import Swatch from '$lib/charts/marks/Swatch.svelte';

	interface Props {
		label: string;
		parts: Categorical;
		/** What each share is a share of. The parts' own sum by default; a part may run past it, and the bar
		    then fills. Zero reads each part by amount instead of by share. */
		base?: number;
		colorBy?: ColorBy;
		fit?: boolean;
	}
	let { label, parts, base, colorBy = 'category', fit = false }: Props = $props();

	const f = $derived(chartFormat(parts.unit));
	const all = $derived(parts.points);
	const whole = $derived(base ?? sumBy(all, (p) => p.value));
	const span = $derived(
		Math.max(
			whole,
			sumBy(all, (p) => p.value)
		)
	);

	const share = (v: number) => `${Math.round((v / whole) * 100)}%`;
	const reading = (p: CategoricalPoint) =>
		whole ? share(p.value) : formatUnit(p.value, parts.unit);
	const colorOf = (p: CategoricalPoint) => keyColor(p.colorKey ?? p.key, colorBy);

	let keyEl = $state<HTMLElement>();
	let probeEl = $state<HTMLElement>();
	let room = $state(Infinity);
	/** Each part's key entry at full width, then the widest `Other` can read. */
	let widths = $state<number[]>([]);
	let gap = $state(0);

	$effect(() => {
		const el = keyEl;
		if (!el || !fit) return;
		return watchWidth(el, (w) => (room = w)).stop;
	});
	$effect(() => {
		const el = probeEl;
		if (!el || !keyEl) return;
		void all;
		const scale = drawnScale(keyEl);
		widths = [...el.children].map((c) => c.getBoundingClientRect().width / scale);
		gap = parseFloat(getComputedStyle(el).columnGap) || 0;
	});

	const measured = $derived(widths.length === all.length + 1);
	const other = $derived(widths[all.length] ?? 0);
	/** The line `n` named parts take, with the rest rolled into `Other` when `rolled`. */
	const used = (n: number, rolled: boolean) =>
		sumBy(widths.slice(0, n), (w) => w) + (rolled ? other + gap : 0) + gap * Math.max(0, n - 1);

	/** The most parts the key can name on one line, the rest rolled into the last slot, never fewer than
	    the largest part and `Other`: a key reading only `Other 100%` says nothing. */
	const limit = $derived.by(() => {
		const least = Math.min(2, all.length);
		if (!fit || !measured || used(all.length, false) <= room) return all.length;
		for (let n = all.length - 1; n > least; n--) if (used(n - 1, true) <= room) return n;
		return least;
	});

	/** The key's own floor, so the card is never narrowed past the least it names. */
	const keyFloor = $derived(
		!measured ? 0 : fit && all.length > 2 ? used(1, true) : used(all.length, false)
	);

	const shown = $derived(fit ? rollup(all, limit) : all);

	/** How fully the total reads, in the room its label leaves it (see `Reading`). */
	let levels = $state<Record<string, number>>({});
</script>

<div class="split">
	<div class="head" use:fitReadings={(l) => (levels = l)}>
		<span class="label">{label}</span>
		<b class="total"><Reading readings={readingsOf(whole, parts.unit)} level={levels[''] ?? 0} /></b
		>
	</div>
	<div class="track" role="presentation">
		{#each shown as p (p.key)}
			<span
				class="part"
				style:width="{span ? (p.value / span) * 100 : 0}%"
				style:background={colorOf(p)}
				role="presentation"
				onmousemove={(e) =>
					showTip(
						`<b>${esc(p.key)}</b><br>${f.exact(p.value)}${whole ? ` · ${share(p.value)}` : ''}`,
						e
					)}
				onmouseleave={hideTip}
			></span>
		{/each}
	</div>
	<ul class="key" style:min-width="{keyFloor}px" bind:this={keyEl}>
		{#each shown as p (p.key)}
			<li><Swatch color={colorOf(p)} />{p.key} <span class="v">{reading(p)}</span></li>
		{/each}
	</ul>
	<ul class="key probe" aria-hidden="true" bind:this={probeEl}>
		{#each all as p (p.key)}
			<li><Swatch color={colorOf(p)} />{p.key} <span class="v">{reading(p)}</span></li>
		{/each}
		<li><Swatch color={keyColor('Other')} />Other <span class="v">100%</span></li>
	</ul>
</div>

<style>
	.split {
		position: relative;
		display: grid;
		gap: var(--space-3);
		min-width: 0;
	}
	.head {
		display: flex;
		white-space: nowrap;
		justify-content: space-between;
		align-items: baseline;
		gap: var(--gap-row);
	}
	.label {
		color: var(--ink-3);
		font-size: var(--text-caption);
	}
	/* Takes the room the label leaves, so a fuller reading has somewhere to go (see `Reading`). */
	.total {
		flex: 1 1 auto;
		min-width: 0;
		text-align: right;
		font-variant-numeric: tabular-nums;
		font-weight: var(--fw-semibold);
	}
	.track {
		display: flex;
		height: 10px;
		border-radius: var(--radius-pill);
		overflow: hidden;
		background: var(--inset);
	}
	.part {
		height: 100%;
	}
	.part + .part {
		box-shadow: inset 1px 0 0 var(--surface);
	}
	/* One line, never wrapped: `fit` rolls parts into Other until it fits, so the card's height does not
	   depend on its width and its floor holds whatever width it is resized from. */
	.key {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-wrap: nowrap;
		overflow: hidden;
		column-gap: var(--space-6);
		row-gap: var(--space-2);
		font-size: var(--text-caption);
		color: var(--ink-2);
	}
	.key li {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		white-space: nowrap;
	}
	.v {
		color: var(--ink-3);
		font-variant-numeric: tabular-nums;
	}
	.probe {
		flex-wrap: nowrap;
	}
	.probe li {
		flex: none;
	}
</style>

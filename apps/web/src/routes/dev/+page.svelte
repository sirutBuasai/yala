<script lang="ts">
	// Development sandbox: demonstrates the data ↔ visualization split.
	//   1. pick a DATA primitive from the catalog
	//   2. the registry filters CHARTS that accept that primitive's kind
	//   3. for layerable charts, only COMPATIBLE series (same unit + axis + labels)
	//      are offered to layer on — add any number of them
	// Self-contained: uses the test fixture, so it runs without a built data.json and
	// this whole `dev/` folder can be deleted without touching production code.
	import '../../app.css';
	import NavMenu from '$lib/ui/NavMenu.svelte';
	import { makeData } from '$lib/data/__fixtures__/dashboard';
	import { CATALOG, build, type DataDef, type Scope } from '$lib/data/catalog';
	import { compatible, type Series } from '$lib/data/primitives';
	import { chartsForKind } from '$lib/charts/registry';
	import Figure from '$lib/charts/Figure.svelte';
	import Pane from '$lib/ui/Pane.svelte';

	const data = makeData();

	/** Prefer the broadest scope a data definition supports. */
	function scopeFor(def: DataDef): Scope {
		if (def.scopes.includes('all')) return { level: 'all' };
		if (def.scopes.includes('year')) return { level: 'year', year: 2025 };
		return { level: 'month', monthKey: '2025-01' };
	}

	let dataId = $state('spending.by_month');
	let chartId = $state('line');
	let layerIds = $state<string[]>([]);

	const def = $derived(CATALOG.find((d) => d.id === dataId)!);
	const primitive = $derived(build(data, dataId, scopeFor(def)));
	const charts = $derived(chartsForKind(primitive.kind));
	const chart = $derived(charts.find((c) => c.id === chartId) ?? charts[0]);

	// Keep the chart selection valid when the data (and thus its kind) changes.
	$effect(() => {
		if (!charts.some((c) => c.id === chartId)) chartId = charts[0]?.id ?? '';
	});

	/** The base series to test layer-compatibility against. */
	const baseSeries = $derived.by<Series | null>(() => {
		if (primitive.kind === 'series') return primitive;
		if (primitive.kind === 'multiseries') return primitive.series[0] ?? null;
		return null;
	});

	/** Other catalog series, built, that can layer onto the base (same unit/axis/labels). */
	const layerable = $derived.by(() => {
		if (!chart?.layerable || !baseSeries)
			return [] as { id: string; label: string; series: Series }[];
		const out: { id: string; label: string; series: Series }[] = [];
		for (const d of CATALOG) {
			if (d.id === dataId || d.kind !== 'series') continue;
			const p = build(data, d.id, scopeFor(d));
			if (p.kind === 'series' && compatible(baseSeries, p)) {
				out.push({ id: d.id, label: d.label, series: p });
			}
		}
		return out;
	});

	// Drop any selected layers that are no longer compatible with the current base.
	$effect(() => {
		const ok = new Set(layerable.map((l) => l.id));
		const filtered = layerIds.filter((id) => ok.has(id));
		if (filtered.length !== layerIds.length) layerIds = filtered;
	});

	const layers = $derived(layerable.filter((l) => layerIds.includes(l.id)).map((l) => l.series));

	function toggleLayer(id: string) {
		layerIds = layerIds.includes(id) ? layerIds.filter((x) => x !== id) : [...layerIds, id];
	}
</script>

<div class="wrap">
	<NavMenu />
	<header class="top">
		<div class="left">
			<a href="/" class="brand">
				<span class="dot"></span>
				<h1 class="serif">Yala</h1>
			</a>
			<span class="sub">data ↔ visualization sandbox</span>
		</div>
	</header>

	<div class="grid">
		<aside class="controls">
			<section>
				<h2>1 · Data</h2>
				<p class="hint">Pick a data primitive from the catalog.</p>
				<div class="opts">
					{#each CATALOG as d (d.id)}
						<button class:active={d.id === dataId} onclick={() => (dataId = d.id)}>
							<span class="nm">{d.label}</span>
							<span class="kind">{d.kind}</span>
						</button>
					{/each}
				</div>
			</section>

			<section>
				<h2>2 · Chart</h2>
				<p class="hint">
					Only charts that accept <code>{primitive.kind}</code> data are offered.
				</p>
				<div class="chips">
					{#each charts as c (c.id)}
						<button class="chip" class:active={c.id === chart?.id} onclick={() => (chartId = c.id)}>
							{c.label}{#if c.layerable}<span class="tag">layerable</span>{/if}
						</button>
					{/each}
				</div>
			</section>

			{#if chart?.layerable && baseSeries}
				<section>
					<h2>3 · Layer</h2>
					<p class="hint">
						Compatible series only — same unit &amp; axis, so they overlay. Add any number.
					</p>
					{#if layerable.length}
						<div class="chips">
							{#each layerable as l (l.id)}
								<button
									class="chip"
									class:active={layerIds.includes(l.id)}
									onclick={() => toggleLayer(l.id)}
								>
									{layerIds.includes(l.id) ? '✓ ' : '+ '}{l.label}
								</button>
							{/each}
						</div>
					{:else}
						<p class="hint">No other catalog series is compatible with this one.</p>
					{/if}
				</section>
			{/if}
		</aside>

		<div class="stage">
			<Pane title={def.label} cap={`${primitive.kind} → ${chart?.label ?? '—'}`}>
				{#key `${dataId}:${chart?.id}:${layerIds.join(',')}`}
					<Figure
						{primitive}
						chart={chart?.id}
						{layers}
						area={chart?.id === 'line' && !layers.length}
					/>
				{/key}
			</Pane>
		</div>
	</div>
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
	.grid {
		display: grid;
		grid-template-columns: 320px 1fr;
		gap: 18px;
		align-items: start;
	}
	@media (max-width: 860px) {
		.grid {
			grid-template-columns: 1fr;
		}
	}
	.controls {
		display: flex;
		flex-direction: column;
		gap: 18px;
	}
	section h2 {
		font-size: 12px;
		text-transform: uppercase;
		letter-spacing: 0.9px;
		color: var(--ink-3);
		margin: 0 0 4px;
	}
	.hint {
		color: var(--ink-3);
		font-size: 12px;
		margin: 0 0 10px;
	}
	.opts {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.opts button {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 10px;
		padding: 9px 12px;
		color: var(--ink-2);
		cursor: pointer;
		font-size: 13px;
		text-align: left;
	}
	.opts button.active {
		border-color: color-mix(in srgb, var(--lav) 55%, var(--border));
		background: color-mix(in srgb, var(--lav) 14%, transparent);
		color: var(--ink);
	}
	.opts .kind {
		font-size: 10.5px;
		color: var(--ink-3);
		font-variant: small-caps;
	}
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	.chip {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 999px;
		padding: 6px 12px;
		color: var(--ink-2);
		cursor: pointer;
		font-size: 12.5px;
	}
	.chip.active {
		border-color: color-mix(in srgb, var(--lav) 55%, var(--border));
		background: color-mix(in srgb, var(--lav) 18%, transparent);
		color: var(--ink);
	}
	.tag {
		font-size: 9.5px;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		color: var(--ink-3);
		border: 1px solid var(--border);
		border-radius: 6px;
		padding: 1px 5px;
	}
	code {
		background: var(--inset);
		border-radius: 5px;
		padding: 1px 5px;
		font-size: 11.5px;
	}
</style>

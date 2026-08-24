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
	import { CATALOG, build, type DataDef } from '$lib/data/catalog';
	import { type Scope } from '$lib/data/scope';
	import { compatible, type Series, type Primitive } from '$lib/data/primitives';
	import { chartsForKind } from '$lib/charts/registry';
	import Figure from '$lib/charts/Figure.svelte';
	import Pane from '$lib/ui/Pane.svelte';
	import SortMenu from '$lib/ui/SortMenu.svelte';

	const data = makeData();

	// Pane header demo: one SortMenu drives every case so alignment is easy to compare.
	const demoFields = [
		{ key: 'name', label: 'Name' },
		{ key: 'date', label: 'Date' }
	];
	let demoKey = $state<'name' | 'date'>('date');
	let demoDir = $state<'asc' | 'desc'>('desc');

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

	// ── Dashboard grid prototype ─────────────────────────────────────────────
	// One Figure renders every cell: a scalar primitive → stat tile, anything else →
	// its chart — a stat is just a small-span cell. The layout (span per cell) is plain
	// data, which is what makes it user-editable. This mirrors the tabs' <Board>.
	type CellCfg = {
		title?: string;
		cap?: string;
		dataId: string;
		chart?: string;
		scope: Scope;
		area?: boolean;
		span: number;
	};

	let view = $state<'composer' | 'dashboard' | 'headers'>('composer');
	let editLayout = $state(false);

	let layout = $state<CellCfg[]>([
		{ dataId: 'income.total', scope: { level: 'all' }, title: 'Lifetime income', span: 2 },
		{ dataId: 'spending.total', scope: { level: 'all' }, title: 'Lifetime spent', span: 2 },
		{ dataId: 'saved.total', scope: { level: 'all' }, title: 'Lifetime saved', span: 2 },
		{
			title: 'Where it all went',
			cap: 'Lifetime',
			dataId: 'spending.where_it_went',
			chart: 'donut',
			scope: { level: 'all' },
			span: 3
		},
		{
			title: 'Income vs Spending vs Savings',
			dataId: 'overview.income_spent_saved',
			chart: 'bar',
			scope: { level: 'all' },
			span: 3
		},
		{
			title: 'Money flow',
			dataId: 'money.flow',
			chart: 'sankey',
			scope: { level: 'all' },
			span: 6
		},
		{
			title: 'Cumulative savings',
			dataId: 'overview.cumulative_saved',
			chart: 'line',
			scope: { level: 'all' },
			area: true,
			span: 3
		},
		{
			title: 'Savings rate by year',
			dataId: 'overview.savings_rate',
			chart: 'line',
			scope: { level: 'all' },
			span: 3
		}
	]);

	/** A cell's primitive, built from the catalog. */
	function primitiveOf(c: CellCfg): Primitive {
		return build(data, c.dataId, c.scope);
	}
</script>

<!-- Universal building block: every cell is a Pane wrapping a Figure. The registry maps the
     primitive's kind to a component (stat vs chart); the page never branches on kind. -->
{#snippet cell(c: CellCfg)}
	<Pane title={c.title ?? ''} cap={c.cap}>
		<Figure primitive={primitiveOf(c)} chart={c.chart} area={c.area} />
	</Pane>
{/snippet}

<!-- Shared action content for the header-alignment demo. -->
{#snippet demoActions()}
	<SortMenu fields={demoFields} bind:sortKey={demoKey} bind:sortDir={demoDir} />
{/snippet}

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
		<div class="modes">
			<button class:on={view === 'composer'} onclick={() => (view = 'composer')}>Composer</button>
			<button class:on={view === 'dashboard'} onclick={() => (view = 'dashboard')}>Dashboard</button
			>
			<button class:on={view === 'headers'} onclick={() => (view = 'headers')}>Headers</button>
			{#if view === 'dashboard'}
				<button class="edit" class:on={editLayout} onclick={() => (editLayout = !editLayout)}>
					{editLayout ? '✓ Editing layout' : 'Edit layout'}
				</button>
			{/if}
		</div>
	</header>

	{#if view === 'composer'}
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
							<button
								class="chip"
								class:active={c.id === chart?.id}
								onclick={() => (chartId = c.id)}
							>
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
	{:else if view === 'headers'}
		<!-- Pane header alignment across the four title/cap/actions combinations. The actions
		     (a SortMenu) should sit level with the last text line — cap if present, else title. -->
		<div class="hdemo">
			<div class="case">
				<span class="clabel">title + action</span>
				<Pane title="Transaction history" actions={demoActions}>
					<p class="demobody">pane body</p>
				</Pane>
			</div>
			<div class="case">
				<span class="clabel">title + cap + action</span>
				<Pane title="Transaction history" cap="47 transactions · Jul 2026" actions={demoActions}>
					<p class="demobody">pane body</p>
				</Pane>
			</div>
			<div class="case">
				<span class="clabel">cap + action</span>
				<Pane cap="47 transactions · Jul 2026" actions={demoActions}>
					<p class="demobody">pane body</p>
				</Pane>
			</div>
			<div class="case">
				<span class="clabel">action only</span>
				<Pane actions={demoActions}>
					<p class="demobody">pane body</p>
				</Pane>
			</div>
		</div>
	{:else}
		<!-- Dashboard grid prototype: one Figure renders every cell (stat or chart);
		     layout is pure data (span per cell), so it's serializable + user-editable. -->
		<div class="dash">
			{#each layout as c, i (i)}
				<div class="dcell" style:grid-column={`span ${c.span}`}>
					{#if editLayout}
						<div class="spanctl">
							{#each [1, 2, 3, 6] as s (s)}
								<button class:on={c.span === s} onclick={() => (c.span = s)}>{s}</button>
							{/each}
						</div>
					{/if}
					{@render cell(c)}
				</div>
			{/each}
		</div>
	{/if}
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
	.modes {
		display: inline-flex;
		gap: 6px;
		margin-left: auto;
		flex-wrap: wrap;
	}
	.modes button {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 999px;
		padding: 6px 14px;
		color: var(--ink-2);
		cursor: pointer;
		font-size: 12.5px;
	}
	.modes button.on {
		border-color: color-mix(in srgb, var(--lav) 55%, var(--border));
		background: color-mix(in srgb, var(--lav) 18%, transparent);
		color: var(--ink);
	}
	/* Pane header demo: stacked cases, each labelled with its title/cap/actions combination. */
	.hdemo {
		display: flex;
		flex-direction: column;
		gap: 20px;
		max-width: 640px;
	}
	.clabel {
		display: block;
		margin-bottom: 6px;
		font-size: 11px;
		text-transform: uppercase;
		letter-spacing: 0.9px;
		color: var(--ink-3);
	}
	.demobody {
		margin: 0;
		color: var(--ink-3);
		font-size: 12px;
	}
	/* Dashboard grid prototype: a 6-column grid; each cell spans 1..6 columns. */
	.dash {
		display: grid;
		grid-template-columns: repeat(6, 1fr);
		gap: 14px;
		align-items: stretch;
	}
	.dcell {
		position: relative;
		display: flex;
		flex-direction: column;
		min-width: 0;
		min-height: 130px;
	}
	/* Let the pane fill its cell so charts grow to the row height. */
	.dcell :global(.card) {
		flex: 1 1 auto;
	}
	.spanctl {
		position: absolute;
		top: 6px;
		right: 6px;
		z-index: 2;
		display: inline-flex;
		gap: 2px;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 8px;
		padding: 2px;
		box-shadow: var(--shadow);
	}
	.spanctl button {
		border: 0;
		background: none;
		color: var(--ink-3);
		cursor: pointer;
		font-size: 11px;
		border-radius: 6px;
		padding: 2px 7px;
	}
	.spanctl button.on {
		background: color-mix(in srgb, var(--lav) 18%, transparent);
		color: var(--ink);
	}
	@media (max-width: 860px) {
		.dash {
			grid-template-columns: repeat(2, 1fr);
		}
		.dcell {
			grid-column: span 2 !important;
		}
	}
</style>

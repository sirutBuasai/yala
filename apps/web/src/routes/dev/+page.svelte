<script lang="ts">
	// Design-token gallery. Renders every semantic token defined in app.css at its real
	// value, grouped by role + data importance, then shows the tokens in context across
	// charts, tables, fields, panes, a board and the spacing/radius primitives. The point
	// is coherence: near-duplicate ad-hoc values (10.5/11/11.5px, 12/12.5/13px, …) are
	// collapsed onto one ramp, and roles that legitimately share a value (subtitle vs
	// column title) still get their own named token so intent stays explicit.
	import '../../app.css';
	import NavMenu from '$lib/nav/NavMenu.svelte';
	import Pane from '$lib/layout/Pane.svelte';
	import Figure from '$lib/charts/Figure.svelte';
	import { makeData } from '$lib/data/__fixtures__/dashboard';
	import { build } from '$lib/data/catalog';

	const data = makeData();
	const all = { level: 'all' } as const;

	// `font` mirrors the app's real family per role: serif (--font-display, the fancy
	// title face) is applied via .serif to titles/brand/stat value only; everything else
	// is the modern sans body face. Note text-panel (serif) vs text-amount (sans) share
	// 16px — same size, different family AND role.
	type TypeToken = {
		name: string;
		px: number;
		primitive: string;
		role: string;
		font: 'serif' | 'sans';
	};
	type Group = { title: string; note: string; tokens: TypeToken[] };

	// Font-size tokens grouped by data importance. `px` is the resolved value (for the
	// readout); the sample itself is sized by `var(--text-…)`, so it reflects app.css.
	const typeGroups: Group[] = [
		{
			title: 'Hero & titles',
			note: 'The loudest type — fancy serif face, one clear step apart.',
			tokens: [
				{
					name: 'text-display',
					px: 28,
					primitive: 'fs-1000',
					role: 'Hero stat number (StatTile value)',
					font: 'serif'
				},
				{
					name: 'text-brand',
					px: 26,
					primitive: 'fs-900',
					role: 'App wordmark “Yala”',
					font: 'serif'
				},
				{
					name: 'text-title',
					px: 22,
					primitive: 'fs-800',
					role: 'Per-view / section title (ViewHeader)',
					font: 'serif'
				},
				{
					name: 'text-dialog',
					px: 18,
					primitive: 'fs-700',
					role: 'Modal, sidebar & overlay titles',
					font: 'serif'
				},
				{
					name: 'text-panel',
					px: 16,
					primitive: 'fs-600',
					role: 'Sub-panel titles, card h2',
					font: 'serif'
				},
				{
					name: 'text-amount',
					px: 16,
					primitive: 'fs-600',
					role: 'Emphasized inline amount (take-home)',
					font: 'sans'
				}
			]
		},
		{
			title: 'Body & controls',
			note: 'The reading + interaction layer — modern sans face.',
			tokens: [
				{
					name: 'text-body',
					px: 14,
					primitive: 'fs-500',
					role: 'Default body copy (base font)',
					font: 'sans'
				},
				{
					name: 'text-control',
					px: 13,
					primitive: 'fs-400',
					role: 'Inputs, selects, buttons, table base',
					font: 'sans'
				},
				{
					name: 'text-row',
					px: 13,
					primitive: 'fs-400',
					role: 'List-row payee + trailing amount',
					font: 'sans'
				},
				{
					name: 'text-subtitle',
					px: 12,
					primitive: 'fs-300',
					role: 'View subtitle (“Lifetime · 2020–2025”)',
					font: 'sans'
				},
				{
					name: 'text-secondary',
					px: 12,
					primitive: 'fs-300',
					role: 'Secondary body: stat delta, notes',
					font: 'sans'
				}
			]
		},
		{
			title: 'Meta & labels',
			note: 'Supporting sans text. Five roles share 11px but stay distinct tokens.',
			tokens: [
				{
					name: 'text-caption',
					px: 11,
					primitive: 'fs-200',
					role: 'Figure-column labels, helper text',
					font: 'sans'
				},
				{
					name: 'text-label',
					px: 11,
					primitive: 'fs-200',
					role: 'UPPERCASE form field label',
					font: 'sans'
				},
				{
					name: 'text-column',
					px: 11,
					primitive: 'fs-200',
					role: 'Table header / column title',
					font: 'sans'
				},
				{
					name: 'text-axis',
					px: 11,
					primitive: 'fs-200',
					role: 'Chart axis ticks + group labels',
					font: 'sans'
				},
				{
					name: 'text-meta',
					px: 11,
					primitive: 'fs-200',
					role: 'Row dates, secondary chart labels',
					font: 'sans'
				},
				{
					name: 'text-badge',
					px: 10,
					primitive: 'fs-100',
					role: 'Pending badge, tiny category tag',
					font: 'sans'
				},
				{
					name: 'text-micro',
					px: 10,
					primitive: 'fs-100',
					role: 'In-chart value labels, “+N” indicator',
					font: 'sans'
				}
			]
		}
	];

	// Font-family tokens: two faces, mapped to a semantic display/body pair.
	const families = [
		{
			name: 'font-display',
			alias: '--font-serif',
			role: 'Titles, brand, panel titles, stat value',
			serif: true
		},
		{
			name: 'font-body',
			alias: '--font-sans',
			role: 'Body, controls, labels, lists, tables, meta',
			serif: false
		}
	];

	const weights = [
		{ name: 'fw-regular', v: 400, role: 'Body copy' },
		{ name: 'fw-medium', v: 500, role: 'Tab labels, nav items, row payee' },
		{ name: 'fw-semibold', v: 600, role: 'Titles, values, table headers' },
		{ name: 'fw-bold', v: 700, role: 'Primary/danger buttons, selected' }
	];

	const tracking = [
		{ name: 'ls-tighter', v: '-0.5px', role: 'Hero stat number' },
		{ name: 'ls-tight', v: '-0.3px', role: 'Large headings (brand, sidebar)' },
		{ name: 'ls-snug', v: '-0.2px', role: 'Card / panel titles' },
		{ name: 'ls-wide', v: '0.6px', role: 'Uppercase field labels + table headers' },
		{ name: 'ls-wider', v: '0.9px', role: 'Small-caps section labels' }
	];

	// Spacing: the raw ramp (primitives) plus the named gap aliases components use.
	const spacePrims = [
		['space-1', 2],
		['space-2', 4],
		['space-3', 6],
		['space-4', 8],
		['space-5', 10],
		['space-6', 12],
		['space-7', 14],
		['space-8', 16],
		['space-9', 18],
		['space-10', 20],
		['space-11', 24]
	] as [string, number][];

	const gapAliases = [
		{ name: 'gap-inline', px: 6, role: 'Chips, dots, button pairs' },
		{ name: 'gap-row', px: 8, role: 'Row internals, selectors, toggles' },
		{ name: 'gap-field', px: 12, role: 'Form field rows' },
		{ name: 'gap-grid', px: 14, role: 'Pane / board / dashboard grid' },
		{ name: 'gap-section', px: 18, role: 'Control sections, two-col forms' }
	];

	const padAliases = [
		{ name: 'pad-control', v: '8 × 12', role: 'Inputs, selects, triggers' },
		{ name: 'pad-btn', v: '8 × 16', role: 'Primary / danger buttons' },
		{ name: 'pad-btn-sm', v: '4 × 6', role: 'Mini inline buttons' },
		{ name: 'pad-pill', v: '8 × 14', role: 'Pill toggles' },
		{ name: 'pad-card', v: '18 × 20', role: 'Cards / panels' },
		{ name: 'pad-card-x', v: '20', role: 'Card h-padding + bleed anchor' },
		{ name: 'pad-cell', v: '8', role: 'Calendar / table cells' },
		{ name: 'pad-listrow', v: '8 × 20', role: 'List rows (inset to card)' }
	];

	// Rows for the edge-to-edge bleed demo (mirrors RowList's real markup).
	const bleedRows = [
		{ label: 'Trader Joe’s', amt: '$42' },
		{ label: 'Rent', amt: '$1,850' },
		{ label: 'Paycheck', amt: '+$3,496' }
	];

	const radii = [
		{ name: 'radius-xs', px: 3, role: 'Color swatches' },
		{ name: 'radius-sm', px: 6, role: 'Chips, tags, mini buttons' },
		{ name: 'radius-md', px: 9, role: 'Inputs, buttons, triggers' },
		{ name: 'radius-lg', px: 12, role: 'Popups, day cells' },
		{ name: 'radius-xl', px: 16, role: 'Cards / panes' },
		{ name: 'radius-pill', px: 999, role: 'Pills, round nav, dots' }
	];

	// Live primitives for the "in context" examples.
	const stats = ['income.total', 'spending.total', 'saved.total', 'ratio.savings_rate'].map(
		(id) => ({
			def: id,
			primitive: build(data, id, all)
		})
	);
	const donut = build(data, 'spending.where_it_went', all);
	const bars = build(data, 'overview.income_spent_saved', all);
	const cumulative = build(data, 'overview.cumulative_saved', all);
	const table = build(data, 'income.paychecks', all);
</script>

<div class="wrap">
	<NavMenu />

	<header class="top">
		<a href="/" class="brand">
			<span class="dot"></span>
			<h1 class="serif">Yala</h1>
		</a>
		<span class="sub">design token gallery</span>
	</header>

	<p class="lead">
		Every value below is a semantic token from <code>app.css</code>. Components reference
		<em>roles</em> (<code>--text-subtitle</code>), never raw pixels. Roles that share a value keep
		separate names, so either can move without disturbing the other.
	</p>

	<!-- ── Font family ────────────────────────────────────────────────────── -->
	<h2 class="sec">Font family</h2>
	<section class="card grp">
		<div class="grphead">
			<h3>Two faces</h3>
			<span>Fancy serif for titles; modern sans for everything else.</span>
		</div>
		<div class="tlist">
			{#each families as f (f.name)}
				<div class="trow">
					<code class="tname">--{f.name}</code>
					<span class="tmeta">{f.alias}</span>
					<span class="trole">{f.role}</span>
					<span class="tsample" class:serif={f.serif} style="font-size: var(--text-title)">
						Yala savings 1,240
					</span>
				</div>
			{/each}
		</div>
	</section>

	<!-- ── Typography ─────────────────────────────────────────────────────── -->
	<h2 class="sec">Type scale</h2>
	{#each typeGroups as g (g.title)}
		<section class="card grp">
			<div class="grphead">
				<h3>{g.title}</h3>
				<span>{g.note}</span>
			</div>
			<div class="tlist">
				{#each g.tokens as t (t.name)}
					<div class="trow">
						<code class="tname">--{t.name}</code>
						<span class="tmeta">{t.px}px · {t.primitive} · {t.font}</span>
						<span class="trole">{t.role}</span>
						<span
							class="tsample"
							class:serif={t.font === 'serif'}
							style="font-size: var(--{t.name})">Aa Yala 1,240</span
						>
					</div>
				{/each}
			</div>
		</section>
	{/each}

	<!-- ── Weight + tracking ──────────────────────────────────────────────── -->
	<div class="cols2">
		<section class="card grp">
			<div class="grphead"><h3>Font weight</h3></div>
			<div class="tlist">
				{#each weights as w (w.name)}
					<div class="trow">
						<code class="tname">--{w.name}</code>
						<span class="tmeta">{w.v}</span>
						<span class="trole">{w.role}</span>
						<span class="tsample" style="font-weight: var(--{w.name})">Money flow</span>
					</div>
				{/each}
			</div>
		</section>
		<section class="card grp">
			<div class="grphead"><h3>Letter spacing</h3></div>
			<div class="tlist">
				{#each tracking as t (t.name)}
					<div class="trow">
						<code class="tname">--{t.name}</code>
						<span class="tmeta">{t.v}</span>
						<span class="trole">{t.role}</span>
						<span class="tsample" style="letter-spacing: var(--{t.name})">HEADING</span>
					</div>
				{/each}
			</div>
		</section>
	</div>

	<!-- ── Spacing ────────────────────────────────────────────────────────── -->
	<h2 class="sec">Spacing</h2>
	<div class="cols2">
		<section class="card grp">
			<div class="grphead">
				<h3>Ramp (primitives)</h3>
				<span>Every allowed gap/pad value.</span>
			</div>
			<div class="ramp">
				{#each spacePrims as [name, px] (name)}
					<div class="rrow">
						<code class="tname">--{name}</code>
						<span class="bar" style="width: var(--{name})"></span>
						<span class="tmeta">{px}px</span>
					</div>
				{/each}
			</div>
		</section>
		<section class="card grp">
			<div class="grphead">
				<h3>Gap aliases</h3>
				<span>What components actually reference.</span>
			</div>
			<div class="ramp">
				{#each gapAliases as g (g.name)}
					<div class="rrow">
						<code class="tname">--{g.name}</code>
						<span class="bar accent" style="width: var(--{g.name})"></span>
						<span class="tmeta">{g.px}px</span>
						<span class="trole">{g.role}</span>
					</div>
				{/each}
			</div>
		</section>
	</div>

	<section class="card grp">
		<div class="grphead">
			<h3>Padding aliases</h3>
			<span>Compound insets, standardized.</span>
		</div>
		<div class="padgrid">
			{#each padAliases as p (p.name)}
				<div class="padcell">
					<div class="padbox" style="padding: var(--{p.name})"><span></span></div>
					<code class="tname">--{p.name}</code>
					<span class="tmeta">{p.v}</span>
					<span class="trole">{p.role}</span>
				</div>
			{/each}
		</div>
	</section>

	<!-- ── Radius ─────────────────────────────────────────────────────────── -->
	<h2 class="sec">Radius</h2>
	<section class="card grp">
		<div class="radgrid">
			{#each radii as r (r.name)}
				<div class="radcell">
					<div class="radbox" style="border-radius: var(--{r.name})"></div>
					<code class="tname">--{r.name}</code>
					<span class="tmeta">{r.px === 999 ? 'pill' : r.px + 'px'}</span>
					<span class="trole">{r.role}</span>
				</div>
			{/each}
		</div>
	</section>

	<!-- ── In context ─────────────────────────────────────────────────────── -->
	<h2 class="sec">In context</h2>

	<div class="board">
		{#each stats as s (s.def)}
			<div class="cell span2">
				<Pane title={s.primitive.kind === 'scalar' ? s.primitive.label : s.def} cap="Lifetime">
					<Figure primitive={s.primitive} />
				</Pane>
			</div>
		{/each}
		<div class="cell span3">
			<Pane title="Where it went" cap="Lifetime · donut">
				<Figure primitive={donut} chart="donut" />
			</Pane>
		</div>
		<div class="cell span3">
			<Pane title="Income vs Spending vs Savings" cap="Lifetime · bars">
				<Figure primitive={bars} chart="bar" />
			</Pane>
		</div>
		<div class="cell span3">
			<Pane title="Cumulative savings" cap="Lifetime · area line">
				<Figure primitive={cumulative} chart="line" area />
			</Pane>
		</div>
		<div class="cell span3">
			<Pane title="Paychecks" cap="Lifetime · table">
				<Figure primitive={table} chart="table" />
			</Pane>
		</div>
	</div>

	<!-- Fields, buttons, controls -->
	<section class="card grp">
		<div class="grphead">
			<h3>Fields & controls</h3>
			<span>Labels, inputs, buttons, pills, triggers.</span>
		</div>
		<div class="demorow">
			<div class="field">
				<label for="d1">Payee</label>
				<input id="d1" value="Trader Joe's" />
			</div>
			<div class="field">
				<label for="d2">Amount</label>
				<input id="d2" type="number" value="42" />
			</div>
			<div class="field">
				<label for="d3">Account</label>
				<button class="trigger" type="button"
					><span class="val">Checking</span><span>▾</span></button
				>
			</div>
		</div>
		<div class="demorow btns">
			<button class="btn-primary">Save</button>
			<button class="btn-danger">Delete</button>
			<button class="btn-ghost">Ghost</button>
			<button class="btn-cancel">Cancel</button>
			<button class="btn-mini">+ Add row</button>
			<button class="pill">Theme</button>
			<button class="pill active">Edit</button>
		</div>
	</section>

	<!-- Reusable edge-to-edge bleed: .bleed-x + --pad-card-x (same recipe as RowList) -->
	<section class="card grp">
		<div class="grphead">
			<h3>Edge-to-edge bleed</h3>
			<span>Hover a row — highlight runs to the card edge; divider + content stay inset.</span>
		</div>
		<div class="bleed-x">
			{#each bleedRows as r (r.label)}
				<div class="blrow">
					<span>{r.label}</span>
					<span class="blamt">{r.amt}</span>
				</div>
			{/each}
		</div>
	</section>
</div>

<style>
	.top {
		display: flex;
		align-items: baseline;
		gap: var(--gap-field);
		margin-bottom: var(--gap-row);
	}
	.brand {
		display: flex;
		align-items: baseline;
		gap: var(--gap-field);
		text-decoration: none;
		color: inherit;
	}
	.brand h1 {
		font-size: var(--text-brand);
		margin: 0;
		font-weight: var(--fw-semibold);
		letter-spacing: var(--ls-tight);
	}
	.brand .dot {
		width: 9px;
		height: 9px;
		border-radius: var(--radius-pill);
		background: var(--lav);
		box-shadow: 0 0 0 4px color-mix(in srgb, var(--lav) 20%, transparent);
		align-self: center;
	}
	.sub {
		color: var(--ink-3);
		font-size: var(--text-subtitle);
	}
	.lead {
		color: var(--ink-2);
		font-size: var(--text-control);
		max-width: 70ch;
		margin: 0 0 var(--space-10);
	}
	code {
		background: var(--inset);
		border-radius: var(--radius-xs);
		padding: 1px 5px;
		font-size: var(--text-caption);
	}
	.sec {
		font-family: var(--font-display);
		font-size: var(--text-title);
		font-weight: var(--fw-semibold);
		letter-spacing: var(--ls-snug);
		margin: var(--space-11) 0 var(--gap-field);
	}
	.grp {
		margin-bottom: var(--gap-grid);
	}
	.grphead {
		display: flex;
		align-items: baseline;
		gap: var(--gap-field);
		margin-bottom: var(--gap-field);
	}
	.grphead h3 {
		font-family: var(--font-display);
		font-size: var(--text-panel);
		font-weight: var(--fw-semibold);
		margin: 0;
	}
	.grphead span {
		font-size: var(--text-secondary);
		color: var(--ink-3);
	}
	.cols2 {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: var(--gap-grid);
	}
	@media (max-width: 860px) {
		.cols2 {
			grid-template-columns: 1fr;
		}
	}

	/* Type / weight / tracking rows: name · meta · role · live sample */
	.tlist {
		display: flex;
		flex-direction: column;
	}
	.trow {
		display: grid;
		grid-template-columns: 150px 92px 1fr minmax(160px, 40%);
		align-items: baseline;
		gap: var(--gap-field);
		padding: var(--space-3) 0;
		border-top: 1px solid var(--border);
	}
	.trow:first-child {
		border-top: 0;
	}
	.tname {
		background: none;
		padding: 0;
		color: var(--lav-text);
		font-size: var(--text-caption);
	}
	.tmeta {
		font-size: var(--text-meta);
		color: var(--ink-3);
	}
	.trole {
		font-size: var(--text-secondary);
		color: var(--ink-2);
	}
	.tsample {
		color: var(--ink);
		text-align: right;
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
	}

	/* Spacing ramp */
	.ramp {
		display: flex;
		flex-direction: column;
		gap: var(--gap-row);
	}
	.rrow {
		display: grid;
		grid-template-columns: 120px 1fr auto;
		align-items: center;
		gap: var(--gap-field);
	}
	.rrow .trole {
		grid-column: 2 / -1;
		margin-top: 2px;
	}
	.bar {
		height: 12px;
		background: var(--ink-3);
		border-radius: var(--radius-xs);
	}
	.bar.accent {
		background: var(--lav);
	}

	/* Padding boxes */
	.padgrid,
	.radgrid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
		gap: var(--gap-grid);
	}
	.padcell,
	.radcell {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}
	.padbox {
		background: color-mix(in srgb, var(--lav) 14%, transparent);
		border: 1px dashed color-mix(in srgb, var(--lav) 55%, var(--border));
		border-radius: var(--radius-md);
		width: fit-content;
	}
	.padbox span {
		display: block;
		width: 44px;
		height: 20px;
		background: var(--lav);
		border-radius: var(--radius-xs);
	}
	.radbox {
		height: 60px;
		background: color-mix(in srgb, var(--lav) 18%, transparent);
		border: 1px solid var(--lav);
		margin-bottom: var(--space-2);
	}

	/* Board (mirrors the tab dashboards) */
	.board {
		display: grid;
		grid-template-columns: repeat(6, 1fr);
		gap: var(--gap-grid);
		align-items: stretch;
		margin-bottom: var(--gap-grid);
	}
	.cell {
		display: flex;
		flex-direction: column;
		min-width: 0;
		min-height: 130px;
	}
	.cell :global(.card) {
		flex: 1 1 auto;
	}
	.span2 {
		grid-column: span 2;
	}
	.span3 {
		grid-column: span 3;
	}
	@media (max-width: 860px) {
		.board {
			grid-template-columns: repeat(2, 1fr);
		}
		.cell {
			grid-column: span 2 !important;
		}
	}

	.demorow {
		display: flex;
		gap: var(--gap-field);
		flex-wrap: wrap;
		align-items: flex-end;
	}
	.demorow.btns {
		align-items: center;
		gap: var(--gap-row);
		margin-top: var(--gap-field);
	}

	/* Bleed demo — mirrors RowList: content + divider inset to --pad-card-x, hover full-bleed. */
	.blrow {
		position: relative;
		display: flex;
		justify-content: space-between;
		padding: var(--space-4) var(--pad-card-x);
		font-size: var(--text-row);
	}
	.blrow:not(:last-child)::after {
		content: '';
		position: absolute;
		left: var(--pad-card-x);
		right: var(--pad-card-x);
		bottom: 0;
		height: 1px;
		background: var(--border);
	}
	.blrow:hover {
		background: color-mix(in srgb, var(--lav) 9%, transparent);
	}
	.blamt {
		font-variant-numeric: tabular-nums;
		font-weight: var(--fw-semibold);
	}
</style>

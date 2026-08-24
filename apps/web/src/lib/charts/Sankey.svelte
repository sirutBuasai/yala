<script lang="ts">
	import { money, esc } from '$lib/utils/format';
	import { showTip, hideTip } from '$lib/utils/tooltip';
	// Presentation shapes: the flow registry adapts a Flow primitive into these
	// (adding a colour per node role).
	interface SankeyNode {
		id: string;
		label: string;
		value: number;
		color: string;
		col: number;
	}
	interface SankeyLink {
		source: string;
		target: string;
		value: number;
	}

	interface Props {
		nodes: SankeyNode[];
		links: SankeyLink[];
	}
	let { nodes, links }: Props = $props();

	const W = 1000;
	const H = 540;
	const NODE_W = 13;
	const GAP = 20; // minimum vertical gap between nodes within a column
	const M = { t: 12, b: 12, l: 92, r: 150 };
	const iw = W - M.l - M.r;
	const ih = H - M.t - M.b;

	const layout = $derived.by(() => {
		const cols = [...new Set(nodes.map((n) => n.col))].sort((a, b) => a - b);
		const nCol = cols.length;
		const colCount = (c: number) => nodes.filter((n) => n.col === c).length;
		const colTotal = (c: number) =>
			nodes.filter((n) => n.col === c).reduce((a, n) => a + n.value, 0);

		// A single value→pixel scale, sized so the fullest column fills the height.
		const maxTotal = Math.max(1, ...cols.map(colTotal));
		const maxNodes = Math.max(1, ...cols.map(colCount));
		const scale = (ih - GAP * (maxNodes - 1)) / maxTotal;
		const xOf = (c: number) =>
			nCol > 1 ? M.l + (iw - NODE_W) * (cols.indexOf(c) / (nCol - 1)) : M.l;

		// Place nodes: stack within each column, the whole column centered vertically.
		const placed = new Map<string, { x: number; y: number; h: number; node: SankeyNode }>();
		for (const c of cols) {
			const colNodes = nodes.filter((n) => n.col === c);
			const stackH = colTotal(c) * scale + GAP * (colNodes.length - 1);
			let y = M.t + (ih - stackH) / 2;
			const x = xOf(c);
			for (const n of colNodes) {
				const h = Math.max(1.5, n.value * scale);
				placed.set(n.id, { x, y, h, node: n });
				y += h + GAP;
			}
		}

		// Ribbons: constant-width bands (stroked paths). Stack outgoing/incoming in link order.
		const outOff = new Map<string, number>();
		const inOff = new Map<string, number>();
		const ribbons = links
			.map((l) => {
				const s = placed.get(l.source);
				const t = placed.get(l.target);
				if (!s || !t) return null;
				const w = Math.max(1.5, l.value * scale);
				const so = outOff.get(l.source) ?? 0;
				const to = inOff.get(l.target) ?? 0;
				outOff.set(l.source, so + w);
				inOff.set(l.target, to + w);
				return {
					l,
					w,
					sx: s.x + NODE_W,
					sy: s.y + so + w / 2,
					tx: t.x,
					ty: t.y + to + w / 2,
					color: t.node.color
				};
			})
			.filter((r): r is NonNullable<typeof r> => r !== null);

		const maxCol = cols[cols.length - 1];
		const minCol = cols[0];
		const hasOut = (id: string) => links.some((l) => l.source === id);

		// Label side: right for terminal / last-column nodes, left for the first column,
		// above for interior nodes that still branch onward (avoids overlapping ribbons).
		const nodeViews = [...placed.values()].map((p) => {
			const { node } = p;
			let side: 'left' | 'right' | 'above';
			if (node.col === maxCol || (!hasOut(node.id) && node.col !== minCol)) side = 'right';
			else if (node.col === minCol) side = 'left';
			else side = 'above';
			// Each node's share of its own column's throughput. The first column is the root
			// (trivially 100%), so it's skipped. This is purely structural — no domain meaning
			// baked in — yet reads naturally: column 1 sums to the source, later columns to
			// whatever flowed onward.
			const colTot = colTotal(node.col);
			const pct =
				node.col !== minCol && colTot > 0 ? Math.round((node.value / colTot) * 100) : null;
			return { ...p, side, pct };
		});

		return { nodeViews, ribbons };
	});

	function ribbonPath(sx: number, sy: number, tx: number, ty: number): string {
		const mx = (sx + tx) / 2;
		return `M${sx},${sy} C${mx},${sy} ${mx},${ty} ${tx},${ty}`;
	}
</script>

<svg class="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Money flow from gross income">
	{#each layout.ribbons as r (r.l.source + '>' + r.l.target)}
		<path
			d={ribbonPath(r.sx, r.sy, r.tx, r.ty)}
			fill="none"
			stroke={r.color}
			stroke-width={r.w}
			stroke-opacity="0.32"
			role="presentation"
			onmousemove={(e) =>
				showTip(`<b>${esc(r.l.source)} → ${esc(r.l.target)}</b><br>${money(r.l.value)}`, e)}
			onmouseleave={hideTip}
		/>
	{/each}

	{#each layout.nodeViews as nv (nv.node.id)}
		<rect
			x={nv.x}
			y={nv.y}
			width={NODE_W}
			height={nv.h}
			rx="3"
			fill={nv.node.color}
			role="presentation"
			onmousemove={(e) =>
				showTip(
					`<b>${esc(nv.node.label)}</b><br>${money(nv.node.value)}${nv.pct != null ? ` · ${nv.pct}%` : ''}`,
					e
				)}
			onmouseleave={hideTip}
		/>
		{#if nv.side === 'right'}
			<text class="lbl" x={nv.x + NODE_W + 7} y={nv.y + nv.h / 2 + 4} text-anchor="start">
				{nv.node.label}<tspan class="val" dx="6">{money(nv.node.value)}</tspan
				>{#if nv.pct != null}<tspan class="pct" dx="5">{nv.pct}%</tspan>{/if}
			</text>
		{:else if nv.side === 'left'}
			<text class="lbl" x={nv.x - 8} y={nv.y + nv.h / 2 + 4} text-anchor="end">
				{nv.node.label}<tspan class="val" dx="6">{money(nv.node.value)}</tspan>
			</text>
		{:else}
			<text class="lbl" x={nv.x + NODE_W / 2} y={nv.y - 6} text-anchor="middle">
				{nv.node.label}<tspan class="val" dx="6">{money(nv.node.value)}</tspan
				>{#if nv.pct != null}<tspan class="pct" dx="5">{nv.pct}%</tspan>{/if}
			</text>
		{/if}
	{/each}
</svg>

<style>
	svg {
		display: block;
		width: 100%;
		overflow: visible;
	}
	.lbl {
		fill: var(--ink);
		font-size: 11.5px;
		font-weight: 500;
	}
	.val {
		fill: var(--ink-3);
		font-size: 10px;
		font-variant-numeric: tabular-nums;
	}
	.pct {
		fill: var(--lav-text);
		font-size: 10px;
		font-weight: 600;
		font-variant-numeric: tabular-nums;
	}
</style>

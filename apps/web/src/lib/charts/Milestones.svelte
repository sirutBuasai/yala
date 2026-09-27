<script module lang="ts">
	/** One canvas for every timeline's text measuring, made on first use. */
	let context: CanvasRenderingContext2D | null = null;
	const measure = (text: string, font: string): number => {
		context ??= document.createElement('canvas').getContext('2d');
		if (!context) return 0;
		context.font = font;
		return context.measureText(text).width;
	};
</script>

<script lang="ts">
	// Labels, rail and phase names in three CSS rows; only the rail's row takes the pane's height. Colliding
	// labels merge (`groupLabels`), measured from their text rather than a render.
	import type { Milestone, Phase } from '$lib/data/projection';
	import {
		barRange,
		groupLabels,
		RAIL,
		railThickness,
		type LabelGroup
	} from '$lib/charts/milestones';
	import { moneyCompact } from '$lib/utils/format';
	import { UNIT } from '$lib/layout/grid/units';

	interface Props {
		marks: Milestone[];
		phases: Phase[];
	}
	let { marks, phases }: Props = $props();

	/** One hue per phase, by the order a plan passes through them. */
	const HUE: Record<string, string> = {
		Building: 'var(--role-balance)',
		'Optional coast': 'var(--role-asset)',
		'Optional work': 'var(--role-saving)',
		'Drawing down': 'var(--role-market)'
	};

	let room = $state(0);
	/** The rail's row as CSS laid it out; the rail inside it is absolute, so its size never feeds back. */
	let barHeight = $state(0);
	const bar = barRange(UNIT);
	const rail = $derived(railThickness(barHeight, UNIT));
	let sizer = $state<HTMLElement>();
	/** Bumped once the page's fonts have loaded, since text measured before then was measured in another. */
	let fonts = $state(0);
	/** Each label as placed, carrying its own text: read back from `marks` at render, a label placed for the
	    last set of milestones indexed past the end of the new one. */
	let labels = $state<(LabelGroup & { text: string[] })[]>([]);
	/** The narrowest the labels can go: every milestone merged into one label. Hangs on the milestones alone,
	    never on the width, so a resize's floor is the same wherever it starts. */
	let least = $state(0);

	const from = $derived(marks[0]?.year ?? 0);
	const to = $derived(marks.at(-1)?.year ?? 0);
	const frac = (year: number) =>
		to > from ? Math.min(1, Math.max(0, (year - from) / (to - from))) : 0;

	/** A label's three lines for the milestones it names. */
	const lines = (members: number[]) => {
		const ms = members.map((i) => marks[i]!);
		return [
			ms.map((m) => m.names.join(' · ')).join(' · '),
			ms.map((m) => String(m.year)).join(' · '),
			ms.map((m) => moneyCompact(m.balance)).join(' · ')
		];
	};

	$effect(() => {
		void document.fonts?.ready.then(() => (fonts += 1));
	});

	// Written here and read only by the markup, so it never feeds itself.
	$effect(() => {
		void fonts;
		const probe = sizer;
		const width = room;
		if (!probe) return;
		const faces = [...probe.children].map((line) => getComputedStyle(line).font);
		const widthOf = (members: number[]) =>
			Math.ceil(Math.max(...lines(members).map((text, i) => measure(text, faces[i]!))));
		least = widthOf(marks.map((_, i) => i));
		if (!width) {
			labels = [];
			return;
		}
		labels = groupLabels(
			marks.map((m) => frac(m.year) * width),
			widthOf,
			width
		).map((g) => ({ ...g, text: lines(g.members) }));
	});

	const span = (p: Phase) => ({
		left: frac(p.from) * 100,
		width: (frac(p.to) - frac(p.from)) * 100
	});
</script>

<div
	class="timeline"
	style:--bar-least="{bar.least}px"
	style:--bar-most="{bar.most}px"
	style:--rail="{rail}px"
	style:--rail-most="{RAIL.most}px"
	style:--dot-over="{RAIL.dotOver}px"
>
	<div class="labels" data-floor style:--content-floor="{least}px" bind:clientWidth={room}>
		<!-- Holds the row open at a label's height, and lends its lines' fonts to the measuring. -->
		<span class="label sizer" aria-hidden="true" bind:this={sizer}
			><span class="name">Retire</span><b class="year">2000</b><span class="bal">$0</span></span
		>
		{#each labels as g (g.text.join())}
			{@const [name, year, balance] = g.text}
			<span class="label" style:left="{g.left}px" style:width="{g.width}px"
				><span class="name">{name}</span><b class="year">{year}</b><span class="bal">{balance}</span
				></span
			>
		{/each}
	</div>

	<div class="bar" bind:clientHeight={barHeight}>
		<div class="rail">
			{#each phases as p (p.name)}
				<span
					class="phase"
					style:left="{span(p).left}%"
					style:width="{span(p).width}%"
					style:background={HUE[p.name]}
				></span>
			{/each}
		</div>
		{#each marks as m (m.year)}
			<span class="dot" class:reached={m.reached} style:left="{frac(m.year) * 100}%"></span>
		{/each}
	</div>

	<div class="phases">
		{#each phases as p (p.name)}
			<span
				class="phase-name"
				title={p.name}
				style:left="{span(p).left}%"
				style:width="{span(p).width}%">{p.name}</span
			>
		{/each}
	</div>
</div>

<style>
	/* Bug: a flexible row in a grid of unknown height sizes at its most, pinning the floor at the thickest rail.
	   Lengths come in precomputed: Firefox rejects length-by-length division and drops the whole definition. */
	.timeline {
		--line: 1.3;
		--labels-h: calc((2 * var(--text-caption) + var(--text-control)) * var(--line));
		--phases-h: calc(var(--text-micro) * var(--line));
		--gap: var(--space-2);
		display: grid;
		grid-template-rows: var(--labels-h) minmax(var(--bar-least), 1fr) var(--phases-h);
		row-gap: var(--gap);
		padding-inline: calc((var(--rail-most) + var(--dot-over)) / 2);
		flex: 1 1 auto;
		max-height: calc(var(--labels-h) + var(--bar-most) + var(--phases-h) + 2 * var(--gap));
		min-width: 0;
	}
	.labels,
	.bar,
	.phases {
		position: relative;
		min-width: 0;
	}
	/* Labels regroup a frame after a resize, so visible they read as a spill and stalled the resize. */
	.labels {
		overflow: hidden;
	}
	/* Only lends its lines' fonts to the measuring; the row's height is set above. */
	.sizer {
		position: absolute;
		visibility: hidden;
	}
	.label {
		display: grid;
		justify-items: center;
		white-space: nowrap;
		font-size: var(--text-caption);
		line-height: var(--line);
		color: var(--ink-3);
		position: absolute;
		top: 0;
	}
	.year {
		color: var(--ink);
		font-size: var(--text-control);
		font-weight: var(--fw-semibold);
		font-variant-numeric: tabular-nums;
	}
	.bal {
		color: var(--ink-2);
		font-variant-numeric: tabular-nums;
	}
	.rail {
		position: absolute;
		left: 0;
		right: 0;
		top: 50%;
		height: var(--rail);
		transform: translateY(-50%);
		border-radius: var(--radius-pill);
		overflow: hidden;
		background: var(--inset);
	}
	.phase {
		position: absolute;
		top: 0;
		bottom: 0;
	}
	.dot {
		position: absolute;
		top: 50%;
		height: calc(var(--rail) + var(--dot-over));
		aspect-ratio: 1;
		transform: translate(-50%, -50%);
		border-radius: 50%;
		border: 2px solid var(--surface);
		background: var(--ink-3);
		box-shadow: 0 0 0 1px var(--border);
	}
	.dot.reached {
		background: var(--role-saving);
	}
	/* Named under the rail, cut short where a phase is too brief to hold its name. */
	.phase-name {
		display: block;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		text-align: center;
		font-size: var(--text-micro);
		letter-spacing: var(--ls-wide);
		text-transform: uppercase;
		line-height: var(--line);
		color: var(--ink-3);
		position: absolute;
		top: 0;
	}
</style>

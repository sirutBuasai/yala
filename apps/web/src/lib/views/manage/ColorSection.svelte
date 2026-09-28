<script lang="ts">
	// The colour an account is drawn in, which belongs to its institution or its category. The pick is a
	// draft until the panel saves, so Current and New sit side by side to compare.
	import { familyColors, type ColorKey } from '$lib/data/directory.svelte';
	import Popup from '$lib/overlay/Popup.svelte';
	import Chevron from '$lib/icons/Chevron.svelte';
	import ColorPicker from '$lib/ui/color/ColorPicker.svelte';
	import { THEME_COLORS, parseHex, suggestions } from '$lib/ui/color/color';
	import { COLOR } from '$lib/views/manage/copy';

	interface Props {
		key: ColorKey;
		/** The colour as saved, or null for an institution nobody has coloured. */
		saved: string | null;
		/** The unsaved pick, or null when there is none (bindable). */
		draft: string | null;
		/** Accounts at this institution, for the hint; unused for a category. */
		accounts?: number;
		disabled?: boolean;
	}
	let { key, saved, draft = $bindable(), accounts = 1, disabled = false }: Props = $props();

	const shown = $derived(draft ?? saved);

	/** The rest of the family by colour, so one colour lists every name that shares it. */
	const others = $derived.by(() => {
		const out = new Map<string, string[]>();
		for (const [name, color] of familyColors(key.family)) {
			if (name !== key.name) out.set(color, [...(out.get(color) ?? []), name]);
		}
		return out;
	});

	const suggested = $derived(suggestions([...others.keys(), ...(saved ? [saved] : [])]));
	const clash = $derived(shown ? (others.get(shown) ?? []) : []);

	function pick(color: string) {
		draft = color === saved ? null : color;
	}

	let typed = $state('');
	let typedBad = $state(false);
	$effect(() => {
		typed = shown ?? '';
		typedBad = false;
	});
	function commitTyped() {
		const hex = parseHex(typed);
		typedBad = hex == null && typed.trim() !== '';
		if (hex) pick(hex);
	}

	let otherOpen = $state(false);
	let otherTrigger = $state<HTMLButtonElement>();
	function choose(color: string) {
		pick(color);
		otherOpen = false;
		otherTrigger?.focus();
	}
	function otherKey(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			e.stopPropagation();
			otherOpen = false;
			otherTrigger?.focus();
		}
	}
</script>

{#snippet sample(label: string, color: string | null, dim: boolean)}
	<div class="side" class:dim>
		<div class="top">
			<span class="chip" style:background={color ?? 'var(--inst-neutral)'}></span>
			<span class="stack">
				<span class="lbl">{label}</span>
				<span class="val">{color ?? COLOR.none}</span>
			</span>
		</div>
		<div class="mini">
			<i class="dot" style:background={color ?? 'var(--inst-neutral)'}></i>
			<span class="who">{key.name}</span>
			<i class="bar" style:background={color ?? 'var(--inst-neutral)'}></i>
			<i class="bar short" style:background={color ?? 'var(--inst-neutral)'}></i>
		</div>
	</div>
{/snippet}

<div class="compare">
	{@render sample(COLOR.current, saved, false)}
	{@render sample(COLOR.next, shown, draft == null)}
</div>

<div class="pickrow">
	<div class="field">
		<span>{COLOR.suggested}</span>
		<div class="swatches" role="group" aria-label={COLOR.suggested}>
			{#each suggested as color (color)}
				<button
					type="button"
					class="sw"
					style:background={color}
					aria-label={color}
					aria-pressed={color === shown}
					{disabled}
					onclick={() => pick(color)}
				></button>
			{/each}
			{#if others.size}
				<Popup
					bind:open={otherOpen}
					bind:triggerEl={otherTrigger}
					ariaLabel={COLOR.otherCaption[key.family]}
					triggerClass="other"
					onkeynav={otherKey}
				>
					{#snippet trigger()}
						{COLOR.other}
						<span class="caret" class:up={otherOpen}><Chevron dir="down" size={12} /></span>
					{/snippet}
					<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
					<div
						class="menu popup-panel scroller"
						role="listbox"
						tabindex="-1"
						aria-label={COLOR.otherCaption[key.family]}
						onkeydown={otherKey}
					>
						<div class="cap">{COLOR.otherCaption[key.family]}</div>
						{#each [...others] as [color, names] (color)}
							<button
								type="button"
								class="opt"
								role="option"
								aria-selected={color === shown}
								onclick={() => choose(color)}
							>
								<span class="chip small" style:background={color}></span>
								<span class="hx">{color}</span>
								<span class="names">{names.join(', ')}</span>
							</button>
						{/each}
					</div>
				</Popup>
			{/if}
		</div>
	</div>

	<div class="field">
		<span>{COLOR.hex}</span>
		<div class="hexrow">
			<ColorPicker
				bind:value={() => shown ?? THEME_COLORS[0]!, (v) => pick(v)}
				current={saved ?? shown ?? THEME_COLORS[0]!}
				{disabled}
			/>
			<input
				class="hex"
				aria-label={COLOR.hex}
				placeholder={COLOR.placeholder}
				spellcheck="false"
				bind:value={typed}
				onchange={commitTyped}
				{disabled}
			/>
		</div>
	</div>
</div>

<p class="hint">
	{key.family === 'categories'
		? COLOR.categoryHint(key.name)
		: COLOR.institutionHint(key.name, accounts)}
</p>
{#if typedBad}
	<p class="hint bad" role="status">{COLOR.invalid}</p>
{:else if clash.length}
	<p class="hint warn" role="status">{COLOR.alsoUsedBy(clash)}</p>
{/if}

<style>
	.compare {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(12rem, 100%), 1fr));
		gap: var(--gap-field);
		margin-bottom: var(--space-7);
	}
	.side {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		background: var(--surface-2);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		padding: var(--space-5) var(--space-6);
		min-width: 0;
	}
	.side.dim {
		opacity: 0.55;
	}
	.top {
		display: flex;
		align-items: center;
		gap: var(--space-4);
	}
	.stack {
		display: flex;
		flex-direction: column;
	}
	.lbl {
		font-size: var(--text-label);
		color: var(--ink-3);
		text-transform: uppercase;
		letter-spacing: var(--ls-wide);
	}
	.val {
		font-size: var(--text-control);
		font-weight: var(--fw-semibold);
		font-variant-numeric: tabular-nums;
		color: var(--ink);
	}
	.chip {
		width: 22px;
		height: 22px;
		flex: none;
		border-radius: var(--radius-sm);
		box-shadow: var(--swatch-ring);
	}
	.chip.small {
		width: 16px;
		height: 16px;
		border-radius: var(--radius-xs);
	}
	.mini {
		display: flex;
		align-items: center;
		gap: var(--space-4);
		font-size: var(--text-secondary);
		color: var(--ink-2);
		min-width: 0;
	}
	.who {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.dot {
		width: 8px;
		height: 8px;
		flex: none;
		border-radius: 50%;
	}
	.bar {
		height: 10px;
		width: 90px;
		flex: 0 1 auto;
		min-width: 24px;
		border-radius: var(--radius-xs);
	}
	.bar.short {
		width: 44px;
		opacity: 0.55;
	}
	.pickrow {
		display: flex;
		flex-wrap: wrap;
		gap: var(--gap-grid);
		align-items: flex-start;
	}
	.pickrow .field {
		flex: 0 1 auto;
	}
	.swatches {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-4);
	}
	.sw {
		position: relative;
		width: 26px;
		height: 26px;
		padding: 0;
		border: 0;
		border-radius: var(--radius-sm);
		box-shadow: var(--swatch-ring);
		cursor: pointer;
	}
	.sw[aria-pressed='true'] {
		outline: 2px solid var(--ink);
		outline-offset: 2px;
	}
	:global(.other) {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		height: 26px;
		padding: 0 var(--space-3) 0 var(--space-5);
		background: none;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		color: var(--ink-2);
		font: inherit;
		font-size: var(--text-caption);
		font-weight: var(--fw-semibold);
		cursor: pointer;
	}
	:global(.other:hover) {
		border-color: var(--lav);
		color: var(--ink);
	}
	.caret {
		display: flex;
		transition: transform 0.12s ease;
	}
	.caret.up {
		transform: rotate(180deg);
	}
	.menu {
		--panel-max: 264px;
		min-width: 270px;
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		padding: var(--space-3);
		background: var(--surface-2);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow);
	}
	.cap {
		font-size: var(--text-caption);
		color: var(--ink-3);
		padding: var(--space-2) var(--space-4) var(--space-3);
	}
	.opt {
		display: grid;
		grid-template-columns: 16px 64px 1fr;
		align-items: center;
		gap: var(--space-4);
		padding: var(--space-3) var(--space-4);
		background: none;
		border: 0;
		border-radius: var(--radius-sm);
		color: var(--ink);
		font: inherit;
		font-size: var(--text-secondary);
		text-align: left;
		cursor: pointer;
	}
	.opt:hover,
	.opt:focus-visible,
	.opt[aria-selected='true'] {
		background: var(--inset);
	}
	.hx {
		color: var(--ink-2);
		font-variant-numeric: tabular-nums;
	}
	.hexrow {
		display: flex;
		align-items: center;
		gap: var(--space-4);
		background: var(--inset);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		padding: var(--space-1) var(--space-4) var(--space-1) var(--space-1);
	}
	/* Two classes, so the global `.field input` box never draws inside this row's own. */
	.hexrow .hex {
		width: 6.5em;
		padding: 0;
		border: 0;
		background: none;
		color: var(--ink);
		font: inherit;
		font-size: var(--text-control);
		font-variant-numeric: tabular-nums;
	}
	.hint {
		font-size: var(--text-caption);
		color: var(--ink-3);
		margin: var(--space-4) 0 0;
	}
	.hint.warn {
		color: var(--gold-text);
	}
	.hint.bad {
		color: var(--crit-text);
	}
	@media (prefers-reduced-motion: reduce) {
		.caret {
			transition: none;
		}
	}
</style>

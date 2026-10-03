<script lang="ts" generics="T extends { locator: string }">
	// Shared by the transaction, paycheck and transfer lists; callers supply the column template and divergent
	// cells. The pane owns the height, so an overrunning list scrolls inside it.
	import { tick, type Snippet } from 'svelte';
	import { entryAction, refreshData, type EntryAction } from '$lib/data/load';
	import { SaveState } from '$lib/forms/saveState.svelte';
	import SaveFeedback from '$lib/forms/SaveFeedback.svelte';
	import { monthDay } from '$lib/utils/format';
	import Dot from '$lib/charts/marks/Dot.svelte';
	import Check from '$lib/icons/Check.svelte';
	import Close from '$lib/icons/Close.svelte';
	import RowMain, { type RowHead } from '$lib/lists/parts/RowMain.svelte';

	interface Props {
		items: T[];
		/** Supply to make rows clickable — they open the relevant editor — and to give each row its marks:
		    post a pending entry, delete any entry. Omit for a read-only list. */
		onedit?: (locator: string) => void;
		/** grid-template-columns for the MIDDLE columns only — one track per column the `columns`
		    snippet renders. The date, dot, main and amount tracks are RowList's own. */
		columnTracks?: string;
		dotColor: (item: T) => string;
		/** ISO date for the leading date cell; omit the accessor to hide the date column. */
		dateOf?: (item: T) => string;
		density?: 'compact' | 'comfortable';
		main: (item: T) => RowHead;
		/** Metadata columns between the main text and the amount. Omit for a two-part row. */
		columns?: Snippet<[T]>;
		amount: Snippet<[T]>;
	}
	let {
		items,
		onedit,
		columnTracks,
		dotColor,
		dateOf,
		density = 'compact',
		main,
		columns,
		amount
	}: Props = $props();

	const clickable = $derived(!!onedit);
	const uid = $props.id();

	// The amount track is a floor, not a width, which clipped large totals. The main cell's min-content floor
	// makes the row report a real shortfall; crushable to zero, its badge and marks ran over the title. The
	// title shortens itself within that floor; see RowMain.
	const template = $derived(
		[
			dateOf ? 'var(--col-date)' : '',
			'var(--col-dot)',
			'minmax(min-content, 1fr)',
			columnTracks ?? '',
			'minmax(var(--col-amount), max-content)'
		]
			.filter(Boolean)
			.join(' ')
	);

	/** The row whose delete is waiting for its second click. */
	let armed = $state<string | null>(null);
	/** The row last acted on: it dims until the list reloads without it, and a refusal shows beneath it. */
	let actedOn = $state<string | null>(null);
	let reloading = $state(false);
	const save = new SaveState();
	let listEl = $state<HTMLElement>();

	async function arm(locator: string) {
		armed = locator;
		await tick();
		listEl?.querySelector<HTMLElement>('.act.armed')?.focus();
	}

	async function act(action: EntryAction, locator: string) {
		actedOn = locator;
		reloading = true;
		const ok = await save.run(() => entryAction(action, locator));
		armed = null;
		if (ok) await refreshData();
		reloading = false;
	}
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && (armed = null)} />

<div
	role="list"
	class="list bleed-x"
	class:comfortable={density === 'comfortable'}
	bind:this={listEl}
>
	{#each items as item, i (item.locator)}
		{@const head = main(item)}
		{@const rid = `${uid}-${i}`}
		{#snippet marks()}
			<!-- Space held while hidden, and the armed Delete fills the same box, so neither hovering nor
			     arming reflows the title. -->
			<span class="acts" class:one={!head.pending}>
				{#if armed === item.locator}
					<button
						type="button"
						class="act del armed"
						aria-label={`Confirm delete ${head.title}`}
						disabled={reloading}
						onclick={() => act('delete', item.locator)}>Delete</button
					>
				{:else}
					{#if head.pending}
						<button
							type="button"
							class="act post"
							title="Mark as posted"
							aria-label={`Mark ${head.title} as posted`}
							disabled={reloading}
							onclick={() => act('post', item.locator)}><Check size={13} /></button
						>
					{/if}
					<button
						type="button"
						class="act del"
						title="Delete"
						aria-label={`Delete ${head.title}`}
						disabled={reloading}
						onclick={() => arm(item.locator)}><Close size={13} /></button
					>
				{/if}
			</span>
		{/snippet}
		<!-- A div with a full-row button beneath the cells, not a button row: the marks are buttons too, and a
		     button may not hold another. The opener names itself by the cells, leaving the marks out. -->
		<div
			class="item"
			class:settling={reloading && actedOn === item.locator}
			role="listitem"
			onpointerleave={() => (armed = null)}
			onfocusout={(e) => {
				if (!e.currentTarget.contains(e.relatedTarget as Node | null)) armed = null;
			}}
		>
			{#if clickable}
				<button
					type="button"
					class="open"
					aria-labelledby="{rid}-d {rid}-t {rid}-s {rid}-c {rid}-a"
					onclick={() => onedit?.(item.locator)}
				></button>
			{/if}
			<div class="row" class:clickable style:grid-template-columns={template} data-measure>
				{#if dateOf}<span class="date" id="{rid}-d">{monthDay(dateOf(item))}</span>{/if}
				<Dot color={dotColor(item)} />
				<RowMain {head} labelId={rid} marks={clickable && !head.fixed ? marks : undefined} />
				<!-- `display: contents` keeps each middle column its own grid track while giving the group
			     one switch: at narrow widths the wrapper goes `display: none` and the tracks collapse. -->
				{#if columns}<span class="cols" id="{rid}-c">{@render columns(item)}</span>{/if}
				<span class="amtcell" id="{rid}-a">{@render amount(item)}</span>
			</div>
			{#if actedOn === item.locator && save.error}
				<div class="fail"><SaveFeedback {save} /></div>
			{/if}
		</div>
	{/each}
</div>

<style>
	.list {
		display: flex;
		flex-direction: column;
		/* Size-container so rows react to the PANE's width, not the viewport. */
		container-type: inline-size;
		/* .bleed-x pulls the list to the card's edges for a full-bleed hover; each row's
		   --pad-card-x padding restores the content inset. */
	}
	.cols {
		display: contents;
	}
	/* Bug: auto-placement counts laid-out children, so when the metadata group hid itself the amount
	   slid into its now zero-width track and rendered squashed mid-row. Pin it to the last track. */
	.amtcell {
		grid-column: -2 / -1;
		display: flex;
		justify-content: flex-end;
		min-width: 0;
	}
	/* Too narrow for all three: drop the metadata, never the payee or the amount. */
	@container (max-width: 26rem) {
		.cols {
			display: none;
		}
	}
	/* Bug: padded, the row hid up to its padding of overrun from the pane's floor measure, so a pane could
	   settle with its amounts in the margin. The item pads; the measured row is exactly its tracks. */
	.item {
		position: relative;
		padding: var(--pad-listrow);
	}
	.comfortable .item {
		padding: var(--pad-listrow-comfortable);
	}
	.row {
		display: grid;
		align-items: center;
		gap: var(--space-5);
	}
	/* At a phone's floor the hidden metadata track still costs a gap, which was the last few pixels the
	   amount needed. */
	@container (max-width: 20rem) {
		.row {
			gap: var(--space-4);
		}
	}
	/* The opener covers the item under its cells, which let clicks fall through to it; only the marks catch
	   their own. */
	.open {
		position: absolute;
		inset: 0;
		padding: 0;
		border: 0;
		background: none;
		cursor: pointer;
	}
	.row.clickable {
		pointer-events: none;
	}
	/* Positioned, or the opener, which is, paints over them: only their fade happened to lift them, and a
	   fully opaque mark under the cursor fell beneath it. */
	.acts,
	.fail {
		position: relative;
		pointer-events: auto;
	}
	/* Divider stays inset to the content while the row hover runs full-bleed. */
	.item:not(:last-child)::after {
		content: '';
		position: absolute;
		left: var(--pad-card-x);
		right: var(--pad-card-x);
		bottom: 0;
		height: 1px;
		background: var(--border);
	}
	.item:has(.open):hover {
		background: color-mix(in srgb, var(--lav-wash) calc(9% * var(--wash-scale)), transparent);
	}
	.date {
		color: var(--ink-3);
		font-size: var(--text-meta);
		font-variant-numeric: tabular-nums;
	}

	/* Two fixed slots, so a pending row's pair and a posted row's lone cross start at the same place. */
	.acts {
		display: inline-grid;
		grid-template-columns: repeat(2, var(--mark));
		gap: var(--space-1);
		width: calc(2 * var(--mark) + var(--space-1));
		height: var(--mark);
		--mark: 20px;
	}
	.acts.one {
		grid-template-columns: var(--mark);
		width: var(--mark);
	}
	/* Armed on a posted row, the box widens to a pair's width so Delete fits; the title gives up the room. */
	.acts:has(.armed) {
		grid-template-columns: 1fr;
		width: calc(2 * var(--mark) + var(--space-1));
	}
	.act {
		display: grid;
		place-items: center;
		width: var(--mark);
		height: var(--mark);
		padding: 0;
		border: 0;
		border-radius: var(--radius-pill);
		background: none;
		color: var(--ink-3);
		cursor: pointer;
		opacity: 0;
		transition:
			opacity 0.12s,
			color 0.12s,
			background 0.12s;
	}
	.item:hover .act,
	.item:focus-within .act {
		opacity: 0.8;
	}
	.act:hover {
		opacity: 1;
	}
	.act.post:hover {
		color: var(--good-text);
		background: color-mix(in srgb, var(--good) 20%, transparent);
	}
	.act.del:hover {
		color: var(--crit-text);
		background: color-mix(in srgb, var(--crit) 18%, transparent);
	}
	.act.armed {
		width: 100%;
		opacity: 1;
		color: var(--on-accent);
		background: var(--crit);
		font: inherit;
		font-size: var(--text-badge);
		font-weight: var(--fw-bold);
	}
	.act.armed:hover {
		color: var(--on-accent);
		background: var(--crit-text);
	}
	.act:disabled {
		cursor: progress;
	}
	.settling {
		opacity: 0.5;
	}
	/* No hover to reveal them on a touch screen, so they stay faintly in view. */
	@media (hover: none) {
		.act {
			opacity: 0.45;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.act {
			transition: none;
		}
	}
</style>

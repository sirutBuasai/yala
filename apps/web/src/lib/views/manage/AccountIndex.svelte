<script lang="ts">
	// Finding an account, and nothing else: this side carries no controls over one. Grouped by kind and
	// shut by default, since a full list of every account is longer than the taxonomy is wide; searching
	// flattens the groups, a name being faster to type than a kind is to find. Closed accounts are a
	// group of their own so a reopen can still reach them.
	import type { Snippet } from 'svelte';
	import { accountDirectory } from '$lib/data/directory.svelte';
	import type { AccountInfo } from '$lib/data/types';
	import { accountVar } from '$lib/utils/theme';
	import { kindPlural, kindSingular } from '$lib/views/manage/kinds';
	import Chevron from '$lib/icons/Chevron.svelte';

	interface Props {
		/** The kind names the API declares, in the order the groups should read. */
		kindNames: string[];
		selected: string | null;
		onselect: (account: string) => void;
		/** Controls sitting under the finder, above the groups — opening an account, chiefly. */
		actions?: Snippet;
	}
	let { kindNames, selected, onselect, actions }: Props = $props();

	type Entry = [string, AccountInfo];
	type Group = { key: string; label: string; accounts: Entry[] };

	const CLOSED = 'closed';

	let query = $state('');
	let open = $state<string | null>(null);
	/** Which kind is open INSIDE the closed group, tracked apart so opening one there doesn't read as
	    opening a kind's live accounts. */
	let openClosedKind = $state<string | null>(null);

	/** Every managed account, by name. A plug or an opening-balance account has no kind, and nothing
	    here can act on one, so it is not offered. */
	const all = $derived<Entry[]>(
		accountDirectory()
			.filter(([, info]) => Boolean(info.kind))
			.sort(([a, ia], [b, ib]) => (ia.name ?? a).localeCompare(ib.name ?? b))
	);

	/** One group per kind, in the order the API declares them. Empty groups are dropped, so a kind
	    nothing is declared under never shows. */
	function byKind(entries: Entry[]): Group[] {
		return kindNames
			.map((kind) => ({
				key: kind,
				label: kindPlural(kind),
				accounts: entries.filter(([, info]) => info.kind === kind)
			}))
			.filter((group) => group.accounts.length);
	}

	const groups = $derived(byKind(all.filter(([, info]) => !info.closed)));
	const closed = $derived(all.filter(([, info]) => info.closed));
	const closedGroups = $derived(byKind(closed));

	const infoOf = (account: string | null) =>
		account ? all.find(([path]) => path === account)?.[1] : undefined;

	// Follow the selection into its group — and, for a closed account, into its kind within Closed —
	// so an account picked from a search result, or reached by a rename landing on a new path, is not
	// hidden behind a shut group.
	$effect(() => {
		const info = infoOf(selected);
		if (!info) return;
		open = info.closed ? CLOSED : (info.kind ?? open);
		if (info.closed) openClosedKind = info.kind ?? null;
	});

	const text = $derived(query.trim().toLowerCase());
	const matches = $derived(
		text
			? all.filter(([account, info]) =>
					`${info.name ?? ''} ${account}`.toLowerCase().includes(text)
				)
			: []
	);

	/** The colours of the accounts in a group, so a kind is recognisable before it is opened. */
	const swatch = (accounts: Entry[]) =>
		accounts.slice(0, 3).map(([account]) => accountVar(account));
</script>

<div class="index">
	<div class="finder">
		<span class="glyph" aria-hidden="true">⌕</span>
		<input
			type="search"
			aria-label="Search accounts"
			placeholder="Find an account"
			bind:value={query}
		/>
	</div>

	{#if actions}{@render actions()}{/if}

	<div class="list scroller">
		{#if text}
			{#each matches as [account, info] (account)}
				<button
					type="button"
					class="acct"
					class:on={account === selected}
					class:shut={info.closed}
					onclick={() => onselect(account)}
				>
					<span class="dot" style:background={accountVar(account)}></span>
					<span class="nm">{info.name}</span>
					<span class="meta">{info.closed ? 'Closed' : kindSingular(info.kind ?? '')}</span>
				</button>
			{/each}
			{#if !matches.length}
				<p class="cap">Nothing matches.</p>
			{/if}
		{:else}
			{#each groups as group (group.key)}
				{@render kindGroup(
					group,
					open === group.key,
					() => (open = open === group.key ? null : group.key)
				)}
			{/each}

			{#if closed.length}
				<div class="group shut">
					<button
						type="button"
						class="head"
						aria-expanded={open === CLOSED}
						onclick={() => (open = open === CLOSED ? null : CLOSED)}
					>
						<span class="swatch" aria-hidden="true">
							{#each swatch(closed) as color, i (i)}
								<i style:background={color}></i>
							{/each}
						</span>
						Closed
						<span class="n">{closed.length}</span>
						<span class="caret" class:down={open === CLOSED}><Chevron dir="right" size={12} /></span
						>
					</button>
					{#if open === CLOSED}
						<div class="body">
							{#each closedGroups as group (group.key)}
								{@render kindGroup(
									group,
									openClosedKind === group.key,
									() => (openClosedKind = openClosedKind === group.key ? null : group.key)
								)}
							{/each}
						</div>
					{/if}
				</div>
			{/if}
		{/if}
	</div>
</div>

<!-- One kind's accounts behind one dropdown, used at both levels: a live kind at the top, and a kind
     inside Closed. The caller owns whether it is open, since the two levels track that separately. -->
{#snippet kindGroup(group: Group, isOpen: boolean, toggle: () => void)}
	<div class="group">
		<button type="button" class="head" aria-expanded={isOpen} onclick={toggle}>
			<span class="swatch" aria-hidden="true">
				{#each swatch(group.accounts) as color, i (i)}
					<i style:background={color}></i>
				{/each}
			</span>
			{group.label}
			<span class="n">{group.accounts.length}</span>
			<span class="caret" class:down={isOpen}><Chevron dir="right" size={12} /></span>
		</button>
		{#if isOpen}
			<div class="body">
				{#each group.accounts as [account, info] (account)}
					<button
						type="button"
						class="acct"
						class:on={account === selected}
						onclick={() => onselect(account)}
					>
						<span class="dot" style:background={accountVar(account)}></span>
						<span class="nm">{info.name}</span>
					</button>
				{/each}
			</div>
		{/if}
	</div>
{/snippet}

<style>
	.index {
		display: flex;
		flex-direction: column;
		gap: var(--gap-row);
		min-height: 0;
	}
	.finder {
		display: flex;
		align-items: center;
		gap: var(--gap-inline);
		background: var(--inset);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		padding: var(--pad-control);
	}
	.finder:focus-within {
		border-color: var(--lav);
	}
	.finder .glyph {
		color: var(--ink-3);
	}
	.finder input {
		flex: 1;
		min-width: 0;
		background: none;
		border: 0;
		color: var(--ink);
		font: inherit;
		font-size: var(--text-control);
	}
	.finder input:focus-visible {
		outline: none;
	}
	.list {
		min-height: 0;
	}
	.head {
		display: flex;
		align-items: center;
		gap: var(--gap-inline);
		width: 100%;
		background: none;
		border: 0;
		border-radius: var(--radius-sm);
		padding: var(--space-4) var(--space-3);
		color: var(--ink-2);
		font: inherit;
		font-size: var(--text-row);
		text-align: left;
		cursor: pointer;
	}
	.head:hover {
		background: var(--surface-2);
		color: var(--ink);
		--row: var(--surface-2);
	}
	/* Everything under Closed reads quieter, heads and rows alike — except the one being looked at. */
	.group.shut .head {
		color: var(--ink-3);
	}
	.group.shut .acct:not(.on) .nm {
		color: var(--ink-3);
	}
	/* A kind nested inside Closed: one step down in size, so the two levels don't read as one list. */
	.body .head {
		font-size: var(--text-subtitle);
	}
	.swatch {
		display: flex;
		flex: 0 0 auto;
		padding-right: var(--space-2);
	}
	/* Overlapped, each ringed in the colour BEHIND it so the ring reads as a gap rather than as an
	   outline. That means the row's own background, not the card's: on hover they differ, and a ring
	   left at the card's colour drew a visible circle around every dot. */
	.swatch i {
		width: 11px;
		height: 11px;
		border-radius: var(--radius-pill);
		border: 2px solid var(--row, var(--surface));
		margin-right: -4px;
	}
	.n {
		margin-left: auto;
		font-size: var(--text-badge);
		color: var(--ink-3);
	}
	.caret {
		display: flex;
		color: var(--ink-3);
		transition: transform 0.12s ease;
	}
	.caret.down {
		transform: rotate(90deg);
	}
	.body {
		padding: var(--space-1) 0 var(--space-4) var(--space-6);
	}
	.acct {
		display: flex;
		align-items: center;
		gap: var(--gap-inline);
		width: 100%;
		background: none;
		border: 0;
		border-radius: var(--radius-sm);
		padding: var(--space-4) var(--space-3);
		color: var(--ink);
		font: inherit;
		font-size: var(--text-row);
		text-align: left;
		cursor: pointer;
	}
	.acct:hover {
		background: var(--surface-2);
	}
	/* The row it is, highlighted — no accent bar: the panel beside it already names the account. */
	.acct.on {
		background: var(--surface-2);
		font-weight: var(--fw-medium);
	}
	.acct.shut .nm {
		color: var(--ink-3);
	}
	.dot {
		width: 8px;
		height: 8px;
		border-radius: var(--radius-pill);
		flex: 0 0 8px;
	}
	.nm {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.meta {
		font-size: var(--text-badge);
		color: var(--ink-3);
	}
	.cap {
		font-size: var(--text-caption);
		color: var(--ink-3);
		margin: var(--space-4) var(--space-3);
	}
</style>

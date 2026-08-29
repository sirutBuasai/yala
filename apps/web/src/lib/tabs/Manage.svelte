<script lang="ts">
	import type { DashboardData } from '$lib/data/types';
	import { addAccount, closeAccount, type AccountsInfo } from '$lib/data/load';
	import ViewHeader from '$lib/layout/ViewHeader.svelte';
	import DeleteConfirm from '$lib/forms/fields/DeleteConfirm.svelte';

	interface Props {
		data: DashboardData;
		accounts: AccountsInfo | null;
		edit: boolean;
	}
	let { data, accounts, edit }: Props = $props();

	// The API opens a category as Expenses:<leaf>, so a new name is a single leaf: letters,
	// numbers, or hyphens (mirrors the backend's _LEAF_RE).
	const LEAF_RE = /^[A-Za-z0-9-]+$/;

	const categories = $derived(accounts?.spending_categories ?? []);

	let name = $state('');
	let err = $state('');
	let note = $state('');
	let busy = $state(false);

	async function add() {
		const leaf = name.trim();
		note = '';
		if (!leaf) {
			err = 'Enter a category name.';
			return;
		}
		if (!LEAF_RE.test(leaf)) {
			err = 'Use only letters, numbers, or hyphens.';
			return;
		}
		if (categories.includes(leaf)) {
			err = `${leaf} already exists.`;
			return;
		}
		busy = true;
		err = '';
		const { account, error } = await addAccount('category', leaf);
		if (account) {
			note = `Added ${leaf}.`;
			name = '';
		} else {
			err = error ?? 'Add failed.';
		}
		busy = false;
	}

	async function close(cat: string) {
		note = '';
		err = '';
		// The API closes the full account; categories are the leaf under Expenses:.
		const error = await closeAccount(`Expenses:${cat}`);
		if (error) err = error;
		else note = `Closed ${cat}.`;
	}
</script>

<ViewHeader title="Manage">
	<span class="sub">Spending categories</span>
</ViewHeader>

{#if !edit}
	<p class="hint">
		Managing categories needs the local edit API. Start it with <code>make serve-api</code> and enable
		edit mode.
	</p>
{:else}
	<section class="panel">
		<h3>Add a spending category</h3>
		<div class="addrow">
			<input
				aria-label="new category name"
				bind:value={name}
				placeholder="e.g. Groceries"
				disabled={busy}
				onkeydown={(e) => e.key === 'Enter' && add()}
			/>
			<button type="button" class="btn" onclick={add} disabled={busy}>Add</button>
		</div>
		{#if err}<span class="err" role="alert">{err}</span>{/if}
		{#if note}<span class="note" role="status">{note}</span>{/if}
	</section>

	<section class="panel">
		<h3>Existing categories <span class="count">{categories.length}</span></h3>
		{#if categories.length}
			<ul class="cats">
				{#each categories as cat (cat)}
					<li>
						<span class="cat-name">{cat}</span>
						<DeleteConfirm
							label="Close"
							confirmLabel="Yes, close"
							question={`Close ${cat}?`}
							ondelete={() => close(cat)}
							oncancel={() => (err = '')}
						/>
					</li>
				{/each}
			</ul>
		{:else}
			<p class="hint">No spending categories yet.</p>
		{/if}
	</section>
{/if}

<style>
	.sub {
		color: var(--ink-3);
		font-size: var(--text-subtitle);
	}
	.panel {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		padding: var(--space-8);
		box-shadow: var(--shadow);
		margin-bottom: var(--space-6);
		max-width: 34rem;
	}
	.panel h3 {
		margin: 0 0 var(--space-5);
		font-size: var(--text-control);
		font-weight: var(--fw-semibold);
		color: var(--ink);
	}
	.count {
		color: var(--ink-3);
		font-weight: var(--fw-medium);
	}
	.addrow {
		display: flex;
		gap: var(--gap-inline);
		align-items: center;
	}
	input {
		flex: 1;
		min-width: 0;
		background-color: var(--inset);
		border: 1px solid var(--border);
		color: var(--ink);
		border-radius: var(--radius-md);
		padding: var(--pad-control);
		font-size: var(--text-control);
		font-family: inherit;
	}
	.btn {
		border: 1px solid var(--border);
		background: color-mix(in srgb, var(--lav) 20%, transparent);
		color: var(--ink);
		border-radius: var(--radius-md);
		padding: var(--pad-control);
		font-size: var(--text-control);
		font-weight: var(--fw-medium);
		cursor: pointer;
	}
	.btn:disabled {
		opacity: 0.6;
		cursor: default;
	}
	.err,
	.note {
		display: block;
		margin-top: var(--space-4);
		font-size: var(--text-caption);
	}
	.err {
		color: var(--crit-text);
	}
	.note {
		color: var(--ink-3);
	}
	.hint {
		color: var(--ink-3);
		font-size: var(--text-subtitle);
	}
	.cats {
		display: flex;
		flex-direction: column;
		gap: var(--gap-row);
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.cats li {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--gap-inline);
		background: var(--inset);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		padding: var(--space-3) var(--space-5);
		font-size: var(--text-control);
		color: var(--ink-2);
	}
	.cat-name {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
</style>

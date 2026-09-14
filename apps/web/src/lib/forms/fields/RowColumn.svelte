<script lang="ts" generics="T">
	// The chrome every add-a-row column shares: a header carrying the add button, then one removable
	// row per item. The caller renders a row's own fields; adding, removing and the layout live here.
	import type { Snippet } from 'svelte';

	interface Props {
		rows: T[];
		header: string;
		/** Label for the add-a-row button, worded by the caller. */
		addLabel: string;
		/** A fresh row — only the caller knows its shape. */
		blank: () => T;
		/** What one row is called, for the remove button's spoken name. */
		noun?: string;
		/** Marks the column optional, the way a field label does. */
		optional?: boolean;
		disabled?: boolean;
		row: Snippet<[T, number]>;
	}
	let {
		rows = $bindable(),
		header,
		addLabel,
		blank,
		noun = 'row',
		optional = false,
		disabled = false,
		row
	}: Props = $props();

	function add() {
		rows = [...rows, blank()];
	}
	function remove(i: number) {
		rows = rows.filter((_, idx) => idx !== i);
	}
</script>

<div class="linecol">
	<div class="linehdr">
		<span
			>{header}{#if optional}{' '}<i>optional</i>{/if}</span
		>
		<button type="button" class="btn-mini" {disabled} onclick={add}>{addLabel}</button>
	</div>
	{#each rows as item, i (i)}
		<div class="linerow">
			{@render row(item, i)}
			<button
				type="button"
				class="btn-mini rm"
				aria-label={`Remove ${noun} ${i + 1}`}
				{disabled}
				onclick={() => remove(i)}>✕</button
			>
		</div>
	{/each}
</div>

<style>
	.linehdr {
		display: flex;
		justify-content: space-between;
		align-items: center;
		font-size: var(--text-secondary);
		color: var(--ink-2);
		margin-bottom: var(--gap-inline);
	}
	.linerow {
		display: flex;
		gap: var(--gap-row);
		margin-bottom: var(--gap-inline);
	}
	.rm {
		flex: 0 0 auto;
	}
	.rm:hover {
		border-color: var(--crit);
		color: var(--crit-text);
	}
</style>

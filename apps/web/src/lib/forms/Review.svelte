<script module lang="ts">
	import type { Snippet } from 'svelte';

	/** One line of a guided flow's last step. */
	export interface ReviewRow {
		label: string;
		/** What was answered. Left out when `body` carries a control instead. */
		value?: string;
		/** Reads as unanswered rather than as a value. */
		unset?: boolean;
		/** The step key this row came from; without one the row is derived and offers no way back. */
		step?: string;
		/** A control shown in place of the value, for an answer worth changing without leaving. */
		body?: Snippet;
	}
</script>

<script lang="ts">
	// What a guided flow is about to do, one answer per line. Every line that a question answered can
	// send the user back to it, which is what keeps the last step from being a dead end.
	interface Props {
		rows: ReviewRow[];
		jump: (step: string) => void;
	}
	let { rows, jump }: Props = $props();
</script>

<dl class="review">
	{#each rows as row, i (i)}
		<div class="r">
			<dt>{row.label}</dt>
			<dd class:unset={row.unset}>
				{#if row.body}{@render row.body()}{:else}{row.value}{/if}
			</dd>
			{#if row.step}
				<button type="button" onclick={() => jump(row.step!)}>Change</button>
			{/if}
		</div>
	{/each}
</dl>

<style>
	.review {
		display: flex;
		flex-direction: column;
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		overflow: hidden;
		margin: 0;
	}
	.r {
		display: flex;
		align-items: center;
		gap: var(--gap-row);
		padding: var(--space-5) var(--space-8);
		border-top: 1px solid var(--border);
		font-size: var(--text-control);
		min-height: 2.6rem;
	}
	.r:first-child {
		border-top: 0;
	}
	dt {
		flex: 0 0 9rem;
		margin: 0;
		font-size: var(--text-label);
		text-transform: uppercase;
		letter-spacing: var(--ls-wide);
		color: var(--ink-3);
	}
	dd {
		margin: 0;
		flex: 1;
		min-width: 0;
	}
	dd.unset {
		color: var(--ink-3);
	}
	button {
		background: none;
		border: 0;
		color: var(--lav-text);
		font: inherit;
		font-size: var(--text-caption);
		cursor: pointer;
		padding: var(--space-1) var(--space-2);
		border-radius: var(--radius-sm);
		flex: 0 0 auto;
	}
	button:hover {
		background: var(--inset);
	}
</style>

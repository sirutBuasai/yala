<script module lang="ts">
	export interface Credit {
		account: string;
		amount: number | null;
	}
</script>

<script lang="ts">
	import { formatAccount } from '$lib/format';
	import Select from './Select.svelte';

	interface Props {
		credits: Credit[];
		creditAccounts: string[];
	}
	let { credits = $bindable(), creditAccounts }: Props = $props();

	function add() {
		credits = [...credits, { account: creditAccounts[0] ?? '', amount: null }];
	}
	function remove(i: number) {
		credits = credits.filter((_, idx) => idx !== i);
	}
</script>

<div class="legs">
	<div class="linehdr">
		<span>Credits — amounts reimbursed to you (netted off the bill)</span>
		<button type="button" class="mini" onclick={add}>+ credit</button>
	</div>
	{#each credits as credit, i (i)}
		<div class="linerow">
			<div class="grow">
				<Select
					ariaLabel="credit account"
					bind:value={credit.account}
					options={creditAccounts}
					optionLabel={formatAccount}
				/>
			</div>
			<input type="number" step="0.01" bind:value={credit.amount} placeholder="0" />
			<button type="button" class="mini rm" onclick={() => remove(i)}>✕</button>
		</div>
	{/each}
</div>

<style>
	.legs {
		margin-top: 10px;
	}
	.linehdr {
		display: flex;
		justify-content: space-between;
		align-items: center;
		font-size: 12px;
		color: var(--ink-2);
		margin-bottom: 6px;
	}
	.linerow {
		display: flex;
		gap: 8px;
		margin-bottom: 6px;
	}
	.grow {
		flex: 1;
		min-width: 0;
	}
	.linerow input {
		flex: 1;
		min-width: 0; /* shrink to fit the popup width; no horizontal scroll */
		background-color: var(--inset);
		border: 1px solid var(--border);
		color: var(--ink);
		border-radius: 8px;
		padding: 6px 9px;
		font-size: 12.5px;
		font-family: inherit;
	}
	.mini {
		background: none;
		border: 1px solid var(--border);
		color: var(--ink-2);
		border-radius: 7px;
		padding: 3px 9px;
		cursor: pointer;
		font-size: 11.5px;
	}
	.mini.rm {
		flex: 0 0 auto;
	}
	.mini.rm:hover {
		border-color: var(--crit);
		color: var(--crit-text);
	}
</style>

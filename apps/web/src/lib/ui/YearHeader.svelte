<script lang="ts">
	import type { Scalar } from '$lib/data/primitives';
	import ViewHeader from '$lib/ui/ViewHeader.svelte';
	import KpiRow from '$lib/ui/KpiRow.svelte';
	import Select from '$lib/forms/Select.svelte';

	interface Props {
		title: string;
		years: number[];
		year: number;
		tiles: Scalar[];
	}
	let { title, years, year = $bindable(), tiles }: Props = $props();
</script>

<ViewHeader {title}>
	<div class="yearnav">
		<button class="navbtn" aria-label="Previous year" onclick={() => (year -= 1)}>
			<svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
				<path
					d="M10 3.5 5.5 8 10 12.5"
					fill="none"
					stroke="currentColor"
					stroke-width="1.7"
					stroke-linecap="round"
					stroke-linejoin="round"
				/>
			</svg>
		</button>
		<div class="yearsel">
			<Select
				ariaLabel="Year"
				value={String(year)}
				options={years.map(String)}
				onchange={(v) => (year = Number(v))}
			/>
		</div>
		<button class="navbtn" aria-label="Next year" onclick={() => (year += 1)}>
			<svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
				<path
					d="M6 3.5 10.5 8 6 12.5"
					fill="none"
					stroke="currentColor"
					stroke-width="1.7"
					stroke-linecap="round"
					stroke-linejoin="round"
				/>
			</svg>
		</button>
	</div>
</ViewHeader>

<KpiRow {tiles} />

<style>
	.yearnav {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.yearsel {
		width: 110px;
	}
</style>

<script module lang="ts">
	// Process-wide counter so every Select gets a unique id base for its option ids
	// (needed for aria-activedescendant), even when the consumer passes no `id`.
	let seq = 0;
</script>

<script lang="ts">
	// On-brand replacement for a native <select>: a Popup-hosted listbox.
	// Keyboard: Up/Down move, Enter/Space select, Esc close, Home/End jump.
	import { untrack, type Snippet } from 'svelte';
	import Popup from '$lib/ui/Popup.svelte';

	interface Props {
		/** Selected value (bindable). */
		value: string;
		options: string[];
		id?: string;
		ariaLabel?: string;
		/** Render an option/value for display (default: the raw value). */
		optionLabel?: (v: string) => string;
		placeholder?: string;
		/** Called with the chosen value (useful when the parent stores a non-string, e.g. a year). */
		onchange?: (v: string) => void;
		/** Class on the trigger button (passed through to Popup). */
		triggerClass?: string;
		/** Anchor edge for the dropdown (passed through to Popup). */
		align?: 'left' | 'right';
		/** Custom trigger content, replacing the default value + chevron (e.g. an icon button). */
		customTrigger?: Snippet;
	}
	let {
		value = $bindable(),
		options,
		id,
		ariaLabel,
		optionLabel = (v) => v,
		placeholder = 'Select…',
		onchange,
		triggerClass,
		align,
		customTrigger
	}: Props = $props();

	let open = $state(false);
	let active = $state(-1);
	let triggerEl = $state<HTMLButtonElement>();

	const uid = untrack(() => id) ?? `sel-${++seq}`;
	const listboxId = `${uid}-listbox`;
	const optionId = (i: number) => `${uid}-opt-${i}`;

	function choose(opt: string) {
		value = opt;
		onchange?.(opt);
		open = false;
		triggerEl?.focus();
	}
	function onkeynav(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			e.preventDefault();
			open = false;
			triggerEl?.focus();
		} else if (e.key === 'ArrowDown') {
			e.preventDefault();
			active = Math.min(options.length - 1, active + 1);
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			active = Math.max(0, active - 1);
		} else if (e.key === 'Home') {
			e.preventDefault();
			active = 0;
		} else if (e.key === 'End') {
			e.preventDefault();
			active = options.length - 1;
		} else if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			const opt = options[active];
			if (opt !== undefined) choose(opt);
		}
	}
</script>

<Popup
	bind:open
	bind:triggerEl
	{id}
	{ariaLabel}
	popupRole="listbox"
	matchWidth={!customTrigger}
	{triggerClass}
	{align}
	controls={listboxId}
	activeDescendant={active >= 0 ? optionId(active) : undefined}
	onopen={() => (active = Math.max(0, options.indexOf(value)))}
	{onkeynav}
>
	{#snippet trigger()}
		{#if customTrigger}
			{@render customTrigger()}
		{:else}
			<span class="val" class:placeholder={!value}>{value ? optionLabel(value) : placeholder}</span>
			<svg class="chev" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
				<path
					d="M2.5 4.5 6 8l3.5-3.5"
					fill="none"
					stroke="currentColor"
					stroke-width="1.6"
					stroke-linecap="round"
					stroke-linejoin="round"
				/>
			</svg>
		{/if}
	{/snippet}

	{#snippet children()}
		<ul id={listboxId} class="listbox" role="listbox" tabindex="-1">
			{#each options as opt, i (opt)}
				<!-- Keyboard selection is handled on the trigger (arrows/Enter/Esc), which keeps focus. -->
				<!-- svelte-ignore a11y_click_events_have_key_events -->
				<li
					id={optionId(i)}
					role="option"
					aria-selected={opt === value}
					class:hl={i === active}
					onpointerenter={() => (active = i)}
					onclick={() => choose(opt)}
				>
					<span class="check" aria-hidden="true"
						>{#if opt === value}✓{/if}</span
					>
					<span class="olabel">{optionLabel(opt)}</span>
				</li>
			{/each}
		</ul>
	{/snippet}
</Popup>

<style>
	.chev {
		flex: 0 0 auto;
		color: var(--ink-2);
	}
	.listbox {
		margin: 0;
		padding: 5px;
		list-style: none;
		max-height: 248px;
		overflow-y: auto;
		background: var(--surface-2);
		border: 1px solid var(--border);
		border-radius: 10px;
		box-shadow: var(--shadow);
	}
	li {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 7px 9px;
		border-radius: 7px;
		font-size: 13px;
		color: var(--ink);
		cursor: pointer;
		white-space: nowrap;
	}
	li.hl {
		background: color-mix(in srgb, var(--lav) 20%, transparent);
	}
	li[aria-selected='true'] {
		color: var(--lav-text);
	}
	.check {
		width: 12px;
		flex: 0 0 auto;
		color: var(--lav-text);
		font-size: 11px;
	}
	.olabel {
		overflow: hidden;
		text-overflow: ellipsis;
	}
</style>

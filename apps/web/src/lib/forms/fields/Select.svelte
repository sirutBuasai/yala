<script module lang="ts">
	// Unique id base for option ids (aria-activedescendant), even when the caller passes no `id`.
	let seq = 0;
</script>

<script lang="ts">
	// On-brand replacement for a native <select>: a Popup-hosted listbox. Keyboard: Up/Down move,
	// Enter/Space select, Esc close, Home/End jump, typing seeks by label.
	import { tick, untrack, type Snippet } from 'svelte';
	import { onKey } from '$lib/utils/keys';
	import { isTypeKey, Typeahead } from '$lib/utils/typeahead';
	import Popup from '$lib/overlay/Popup.svelte';

	interface Props {
		/** Selected value (bindable). */
		value: string;
		options: string[];
		id?: string;
		ariaLabel?: string;
		/** Render an option/value for display (default: the raw value). */
		optionLabel?: (v: string) => string;
		placeholder?: string;
		/** Called with the chosen value, for a parent that stores a non-string. */
		onchange?: (v: string) => void;
		/** Class on the trigger button (passed through to Popup). */
		triggerClass?: string;
		/** Anchor edge for the dropdown (passed through to Popup). */
		align?: 'left' | 'right';
		/** Custom trigger content, replacing the default value + chevron. */
		customTrigger?: Snippet;
	}
	let {
		value = $bindable(),
		options,
		id,
		ariaLabel,
		optionLabel = (v) => v,
		placeholder = 'Select...',
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
	const typeahead = new Typeahead();

	// The trigger keeps focus (aria-activedescendant), so the browser never scrolls the list to the
	// active option; a keyboard move off the visible part of a long list has to scroll it here.
	function seek(i: number) {
		if (i < 0) return;
		active = i;
		void tick().then(() =>
			document.getElementById(optionId(i))?.scrollIntoView({ block: 'nearest' })
		);
	}
	function type(key: string) {
		// With nothing chosen, the highlight on the first option is only a resting place: a search must
		// be able to land on it rather than cycle past it.
		const from = options.includes(value) || typeahead.pending() ? active : -1;
		seek(typeahead.type(key, options.map(optionLabel), from));
	}

	function choose(opt: string) {
		value = opt;
		onchange?.(opt);
		open = false;
		triggerEl?.focus();
	}
	function dismiss() {
		open = false;
		triggerEl?.focus();
	}
	function commit() {
		const opt = options[active];
		if (opt !== undefined) choose(opt);
	}
	function onkeynav(e: KeyboardEvent) {
		if (isTypeKey(e) && (e.key !== ' ' || typeahead.pending())) {
			e.preventDefault();
			type(e.key);
			return;
		}
		onKey(e, {
			Escape: dismiss,
			ArrowDown: () => seek(Math.min(options.length - 1, active + 1)),
			ArrowUp: () => seek(Math.max(0, active - 1)),
			Home: () => seek(0),
			End: () => seek(options.length - 1),
			Enter: commit,
			' ': commit
		});
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
	onopen={() => seek(Math.max(0, options.indexOf(value)))}
	{onkeynav}
	ontype={type}
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
		<ul id={listboxId} class="listbox popup-panel scroller trap" role="listbox" tabindex="-1">
			{#each options as opt, i (opt)}
				<!-- Keyboard selection is handled on the trigger, which keeps focus. -->
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
		padding: var(--space-2);
		list-style: none;
		--panel-max: 248px;
		background: var(--surface-2);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		box-shadow: var(--shadow);
	}
	li {
		display: flex;
		align-items: center;
		gap: var(--gap-inline);
		padding: var(--space-4) var(--space-3);
		border-radius: var(--radius-sm);
		font-size: var(--text-control);
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
		font-size: var(--text-caption);
	}
	.olabel {
		overflow: hidden;
		text-overflow: ellipsis;
	}
</style>

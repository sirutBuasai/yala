<script lang="ts">
	// On-brand replacement for a native <select>: a trigger button + a fixed-positioned
	// listbox popup (fixed so it escapes the Modal/Drawer's overflow clipping). Keyboard:
	// Up/Down move, Enter/Space select, Esc close, Home/End jump. Closes on outside click/scroll.
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
	}
	let {
		value = $bindable(),
		options,
		id,
		ariaLabel,
		optionLabel = (v) => v,
		placeholder = 'Select…',
		onchange
	}: Props = $props();

	let open = $state(false);
	let active = $state(-1);
	let placement = $state<'below' | 'above'>('below');
	let trigger = $state<HTMLButtonElement>();
	let listEl = $state<HTMLUListElement>();
	let pos = $state({ top: 0, left: 0, width: 0 });

	const EST_HEIGHT = 260; // used only to decide flip direction

	function place() {
		if (!trigger) return;
		const r = trigger.getBoundingClientRect();
		const below = window.innerHeight - r.bottom;
		placement = below < EST_HEIGHT && r.top > below ? 'above' : 'below';
		pos = {
			top: placement === 'below' ? r.bottom + 4 : r.top - 4,
			left: r.left,
			width: r.width
		};
	}
	function openList() {
		place();
		active = Math.max(0, options.indexOf(value));
		open = true;
	}
	function close() {
		open = false;
	}
	function choose(opt: string) {
		value = opt;
		onchange?.(opt);
		close();
		trigger?.focus();
	}
	function onKey(e: KeyboardEvent) {
		if (!open) {
			if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
				e.preventDefault();
				openList();
			}
			return;
		}
		if (e.key === 'Escape') {
			e.preventDefault();
			close();
			trigger?.focus();
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
			if (options[active] !== undefined) choose(options[active]);
		}
	}

	// Dismiss on outside pointer. On scroll/resize, re-anchor to the (possibly moved) trigger
	// rather than closing — but ignore scrolls that originate inside the list itself, so
	// scrolling through a long option list doesn't dismiss it.
	$effect(() => {
		if (!open) return;
		const onDown = (e: PointerEvent) => {
			const t = e.target as Node;
			if (trigger && !trigger.contains(t) && listEl && !listEl.contains(t)) close();
		};
		const onScroll = (e: Event) => {
			const t = e.target as Node;
			if (listEl && t && listEl.contains(t)) return; // internal list scroll — leave it open
			place();
		};
		document.addEventListener('pointerdown', onDown, true);
		window.addEventListener('scroll', onScroll, true);
		window.addEventListener('resize', place);
		return () => {
			document.removeEventListener('pointerdown', onDown, true);
			window.removeEventListener('scroll', onScroll, true);
			window.removeEventListener('resize', place);
		};
	});
</script>

<button
	{id}
	bind:this={trigger}
	type="button"
	class="trigger"
	aria-haspopup="listbox"
	aria-expanded={open}
	aria-label={ariaLabel}
	onclick={() => (open ? close() : openList())}
	onkeydown={onKey}
>
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
</button>

{#if open}
	<ul
		bind:this={listEl}
		class="listbox {placement}"
		role="listbox"
		tabindex="-1"
		style="top:{pos.top}px; left:{pos.left}px; min-width:{pos.width}px;"
	>
		{#each options as opt, i (opt)}
			<!-- Keyboard selection is handled on the trigger (arrows/Enter/Esc), which keeps focus. -->
			<!-- svelte-ignore a11y_click_events_have_key_events -->
			<li
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
{/if}

<style>
	.trigger {
		display: inline-flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		width: 100%;
		background-color: var(--inset);
		border: 1px solid var(--border);
		color: var(--ink);
		border-radius: 9px;
		padding: 7px 12px;
		font-size: 13px;
		font-family: inherit;
		cursor: pointer;
		text-align: left;
	}
	.trigger:focus-visible {
		outline: none;
		border-color: var(--lav);
		box-shadow: 0 0 0 2px color-mix(in srgb, var(--lav) 30%, transparent);
	}
	.val {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.val.placeholder {
		color: var(--ink-3);
	}
	.chev {
		flex: 0 0 auto;
		color: var(--ink-2);
	}
	.listbox {
		position: fixed;
		z-index: 70;
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
	.listbox.above {
		transform: translateY(-100%);
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

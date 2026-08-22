<script lang="ts">
	// Trigger button + a fixed-positioned popup panel, shared by Select and DatePicker.
	// `position: fixed` so the panel escapes the Modal/Drawer's overflow clipping. Handles
	// open/close, flip-above-when-no-room, outside-click dismiss, and re-anchoring on scroll.
	// Consumers own the panel's contents and the while-open keyboard navigation (onkeynav).
	import type { Snippet } from 'svelte';

	interface Props {
		open?: boolean;
		id?: string;
		ariaLabel?: string;
		/** aria-haspopup value + the kind of panel the consumer renders. */
		popupRole?: 'listbox' | 'dialog';
		/** Estimated panel height; used only to decide flip direction. */
		estHeight?: number;
		/** Panel min-width tracks the trigger width (Select); off for the fixed-size calendar. */
		matchWidth?: boolean;
		/** The trigger element, exposed so consumers can refocus it after choosing. */
		triggerEl?: HTMLButtonElement;
		/** Fired just before opening, to seed panel state (active option / calendar month). */
		onopen?: () => void;
		/** Key handling while open (arrows, Enter, Esc); the closed→open keys are handled here. */
		onkeynav?: (e: KeyboardEvent) => void;
		trigger: Snippet;
		children: Snippet<[{ placement: 'below' | 'above' }]>;
	}
	let {
		open = $bindable(false),
		id,
		ariaLabel,
		popupRole = 'listbox',
		estHeight = 260,
		matchWidth = false,
		triggerEl = $bindable(),
		onopen,
		onkeynav,
		trigger,
		children
	}: Props = $props();

	let placement = $state<'below' | 'above'>('below');
	let popEl = $state<HTMLDivElement>();
	let pos = $state({ top: 0, left: 0, width: 0 });

	function place() {
		if (!triggerEl) return;
		const r = triggerEl.getBoundingClientRect();
		const below = window.innerHeight - r.bottom;
		placement = below < estHeight && r.top > below ? 'above' : 'below';
		pos = {
			top: placement === 'below' ? r.bottom + 4 : r.top - 4,
			left: r.left,
			width: r.width
		};
	}
	function openPopup() {
		onopen?.();
		place();
		open = true;
	}
	function onKey(e: KeyboardEvent) {
		if (!open) {
			if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
				e.preventDefault();
				openPopup();
			}
			return;
		}
		onkeynav?.(e);
	}

	$effect(() => {
		if (!open) return;
		const onDown = (e: PointerEvent) => {
			const t = e.target as Node;
			if (triggerEl && !triggerEl.contains(t) && popEl && !popEl.contains(t)) open = false;
		};
		// Re-anchor to the (possibly moved) trigger on scroll/resize instead of closing, but
		// ignore scrolls originating inside the panel so a long option list stays open.
		const onScroll = (e: Event) => {
			const t = e.target as Node;
			if (popEl && t && popEl.contains(t)) return;
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
	bind:this={triggerEl}
	type="button"
	class="trigger"
	aria-haspopup={popupRole}
	aria-expanded={open}
	aria-label={ariaLabel}
	onclick={() => (open ? (open = false) : openPopup())}
	onkeydown={onKey}
>
	{@render trigger()}
</button>

{#if open}
	<div
		bind:this={popEl}
		class="popup {placement}"
		style="top:{pos.top}px; left:{pos.left}px;{matchWidth ? ` min-width:${pos.width}px;` : ''}"
	>
		{@render children({ placement })}
	</div>
{/if}

<style>
	.popup {
		position: fixed;
		z-index: 70;
	}
	.popup.above {
		transform: translateY(-100%);
	}
</style>

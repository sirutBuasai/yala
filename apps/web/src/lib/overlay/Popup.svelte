<script lang="ts">
	// Trigger button + a floating panel, shared by Select and DatePicker. Placement is Floating UI's;
	// `fixed` is what lets the panel escape a modal's overflow clipping. This component owns open/close and
	// outside-click dismiss; consumers own the panel's contents and the while-open keys (onkeynav).
	import type { Snippet } from 'svelte';
	import { autoUpdate, computePosition, flip, offset, shift, size } from '@floating-ui/dom';
	import { isTypeKey } from '$lib/utils/typeahead';

	interface Props {
		open?: boolean;
		id?: string;
		ariaLabel?: string;
		/** aria-haspopup value + the kind of panel the consumer renders. */
		popupRole?: 'listbox' | 'dialog';
		/** Panel min-width tracks the trigger width (Select); off for the fixed-size calendar. */
		matchWidth?: boolean;
		/** Anchor the panel's left or right edge to the trigger (right avoids clipping a right-aligned trigger). */
		align?: 'left' | 'right';
		/** Class on the trigger button; defaults to the boxed Select/DatePicker chrome. */
		triggerClass?: string;
		/** The trigger element, exposed so consumers can refocus it after choosing. */
		triggerEl?: HTMLButtonElement;
		/** id of the popup panel the trigger controls (aria-controls). */
		controls?: string;
		/** id of the active option/day while open (aria-activedescendant). */
		activeDescendant?: string;
		/** Fired just before opening, to seed panel state (active option / calendar month). */
		onopen?: () => void;
		/** Key handling while open (arrows, Enter, Esc); the closed→open keys are handled here. */
		onkeynav?: (e: KeyboardEvent) => void;
		/** Typeahead while closed: a typed character opens the panel, then is passed here to seek with. */
		ontype?: (key: string) => void;
		trigger: Snippet;
		children: Snippet;
	}
	let {
		open = $bindable(false),
		id,
		ariaLabel,
		popupRole = 'listbox',
		matchWidth = false,
		align = 'left',
		triggerClass = 'trigger',
		triggerEl = $bindable(),
		controls,
		activeDescendant,
		onopen,
		onkeynav,
		ontype,
		trigger,
		children
	}: Props = $props();

	/** Gap between the trigger and the panel, and the margin kept off the viewport edge. */
	const OFFSET = 4;
	const EDGE = 8;

	let popEl = $state<HTMLDivElement>();

	function openPopup() {
		onopen?.();
		open = true;
	}
	function onKey(e: KeyboardEvent) {
		if (!open) {
			if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
				e.preventDefault();
				openPopup();
			} else if (ontype && isTypeKey(e)) {
				e.preventDefault();
				openPopup();
				ontype(e.key);
			}
			return;
		}
		onkeynav?.(e);
	}

	// `autoUpdate` re-anchors on scroll, resize and the trigger moving, rather than closing: a long list
	// stays open while the page behind it scrolls.
	$effect(() => {
		if (!open || !triggerEl || !popEl) return;
		const anchor = triggerEl;
		const panel = popEl;

		const reposition = () =>
			void computePosition(anchor, panel, {
				strategy: 'fixed',
				placement: align === 'right' ? 'bottom-end' : 'bottom-start',
				middleware: [
					offset(OFFSET),
					flip({ padding: EDGE }),
					shift({ padding: EDGE }),
					// The panel caps itself against `--popup-room` (`.popup-panel` in app.css): which part of
					// it should scroll is the consumer's business.
					size({
						padding: EDGE,
						apply: ({ availableHeight, rects, elements }) => {
							elements.floating.style.setProperty('--popup-room', `${availableHeight}px`);
							if (matchWidth) elements.floating.style.minWidth = `${rects.reference.width}px`;
						}
					})
				]
			}).then(({ x, y }) => {
				panel.style.left = `${x}px`;
				panel.style.top = `${y}px`;
			});

		return autoUpdate(anchor, panel, reposition);
	});

	$effect(() => {
		if (!open) return;
		const onDown = (e: PointerEvent) => {
			const t = e.target as Node;
			if (triggerEl && !triggerEl.contains(t) && popEl && !popEl.contains(t)) open = false;
		};
		document.addEventListener('pointerdown', onDown, true);
		return () => document.removeEventListener('pointerdown', onDown, true);
	});
</script>

<button
	{id}
	bind:this={triggerEl}
	type="button"
	class={triggerClass}
	role="combobox"
	aria-haspopup={popupRole}
	aria-expanded={open}
	aria-controls={open ? controls : undefined}
	aria-activedescendant={open ? activeDescendant : undefined}
	aria-label={ariaLabel}
	onclick={() => (open ? (open = false) : openPopup())}
	onkeydown={onKey}
>
	{@render trigger()}
</button>

{#if open}
	<div bind:this={popEl} id={controls} class="popup">
		{@render children()}
	</div>
{/if}

<style>
	/* Coordinates are written by Floating UI; `top: 0; left: 0` is the origin it measures from. Nothing
	   here transforms the panel — a translate would move the box the placer just measured. */
	.popup {
		position: fixed;
		top: 0;
		left: 0;
		z-index: 70;
	}
</style>

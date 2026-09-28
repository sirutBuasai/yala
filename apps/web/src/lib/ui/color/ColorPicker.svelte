<script lang="ts">
	// On-brand replacement for <input type="color">, the colour counterpart of DatePicker: a shade area,
	// a hue strip, the theme's own colours and a hex field in a Popup. Arrows move a focused thumb, Esc
	// closes.
	import Popup from '$lib/overlay/Popup.svelte';
	import Close from '$lib/icons/Close.svelte';
	import { THEME_COLORS, parseHex, toHex, toHsv, type Hsv } from '$lib/ui/color/color';

	interface Props {
		/** `#rrggbb` (bindable). Follows the thumbs as they move. */
		value: string;
		/** What Current returns to: the colour as saved. */
		current: string;
		/** What Default returns to; null offers no Default, as for an institution. */
		fallback?: string | null;
		ariaLabel?: string;
		disabled?: boolean;
	}
	let {
		value = $bindable(),
		current,
		fallback = null,
		ariaLabel = 'Open color picker',
		disabled = false
	}: Props = $props();

	/** Arrow-key steps: a fiftieth of the shade area, two degrees of hue. */
	const SHADE_STEP = 0.02;
	const HUE_STEP = 2;

	let open = $state(false);
	let triggerEl = $state<HTMLButtonElement>();
	/** Held apart from `value` while open, so dragging through a grey keeps the hue it came from. */
	let hsv = $state<Hsv>({ h: 0, s: 0, v: 0 });
	let typed = $state('');

	const clamp = (x: number) => Math.max(0, Math.min(1, x));

	function set(next: Hsv) {
		hsv = next;
		value = toHex(next);
		typed = value;
	}

	function adopt(hex: string) {
		hsv = toHsv(hex);
		value = hex;
		typed = hex;
	}

	/** Tracks one pointer from press to release, reading its place as fractions of `el`. */
	function drag(e: PointerEvent, move: (x: number, y: number) => void) {
		const el = e.currentTarget as HTMLElement;
		el.setPointerCapture(e.pointerId);
		const at = (ev: PointerEvent) => {
			const r = el.getBoundingClientRect();
			move(clamp((ev.clientX - r.left) / r.width), clamp((ev.clientY - r.top) / r.height));
		};
		at(e);
		el.onpointermove = at;
		el.onpointerup = () => (el.onpointermove = null);
	}

	const shade = (x: number, y: number) => set({ ...hsv, s: x, v: 1 - y });
	const hue = (x: number) => set({ ...hsv, h: Math.min(359.9, x * 360) });

	const ARROWS: Record<string, [number, number]> = {
		ArrowLeft: [-1, 0],
		ArrowRight: [1, 0],
		ArrowUp: [0, 1],
		ArrowDown: [0, -1]
	};

	function shadeKey(e: KeyboardEvent) {
		const d = ARROWS[e.key];
		if (!d) return;
		e.preventDefault();
		set({ ...hsv, s: clamp(hsv.s + d[0] * SHADE_STEP), v: clamp(hsv.v + d[1] * SHADE_STEP) });
	}

	function hueKey(e: KeyboardEvent) {
		const d = ARROWS[e.key];
		if (!d) return;
		e.preventDefault();
		set({ ...hsv, h: (hsv.h + (d[0] || d[1]) * HUE_STEP + 360) % 360 });
	}

	function commitTyped() {
		const hex = parseHex(typed);
		if (hex) adopt(hex);
		else typed = value;
	}

	function close() {
		open = false;
		triggerEl?.focus();
	}

	function panelKey(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			e.stopPropagation();
			close();
		}
	}
</script>

<Popup
	bind:open
	bind:triggerEl
	{ariaLabel}
	popupRole="dialog"
	{disabled}
	triggerClass="swatch-trigger"
	onopen={() => adopt(value)}
	onkeynav={panelKey}
>
	{#snippet trigger()}
		<span class="swatch" style:background={value}></span>
	{/snippet}

	<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
	<div
		class="picker popup-panel"
		role="dialog"
		aria-label="Choose color"
		tabindex="-1"
		onkeydown={panelKey}
	>
		<div class="head">
			<span class="title">Choose color</span>
			<button type="button" class="x" aria-label="Close" onclick={close}><Close size={12} /></button
			>
		</div>

		<div
			class="shade"
			style:--hue={`hsl(${hsv.h} 100% 50%)`}
			onpointerdown={(e) => drag(e, shade)}
			role="presentation"
		>
			<span
				class="thumb"
				role="slider"
				tabindex="0"
				aria-label="Shade"
				aria-valuetext={value}
				aria-valuenow={Math.round(hsv.v * 100)}
				style:left={`${hsv.s * 100}%`}
				style:top={`${(1 - hsv.v) * 100}%`}
				style:background={value}
				onkeydown={shadeKey}
			></span>
		</div>

		<div class="hue" onpointerdown={(e) => drag(e, hue)} role="presentation">
			<span
				class="thumb"
				role="slider"
				tabindex="0"
				aria-label="Hue"
				aria-valuemin={0}
				aria-valuemax={360}
				aria-valuenow={Math.round(hsv.h)}
				style:left={`${hsv.h / 3.6}%`}
				style:background={`hsl(${hsv.h} 100% 50%)`}
				onkeydown={hueKey}
			></span>
		</div>

		<div class="theme" role="group" aria-label="Theme colors">
			{#each THEME_COLORS as color (color)}
				<button
					type="button"
					class="chip"
					style:background={color}
					aria-label={color}
					aria-pressed={color === value}
					onclick={() => adopt(color)}
				></button>
			{/each}
		</div>

		<div class="hexrow">
			<span class="swatch small" style:background={value}></span>
			<input
				class="hex"
				aria-label="Hex color"
				spellcheck="false"
				bind:value={typed}
				onchange={commitTyped}
				{disabled}
			/>
		</div>

		<div class="foot">
			<div class="back">
				{#if fallback}
					<button type="button" class="btn-mini" onclick={() => adopt(fallback)}>Default</button>
				{/if}
				<button type="button" class="btn-mini" onclick={() => adopt(current)}>Current</button>
			</div>
			<button type="button" class="btn-mini" onclick={close}>Done</button>
		</div>
	</div>
</Popup>

<style>
	:global(.swatch-trigger) {
		display: flex;
		padding: 0;
		border: 0;
		background: none;
		border-radius: var(--radius-sm);
		cursor: pointer;
	}
	:global(.swatch-trigger:disabled),
	:global(.other:disabled) {
		opacity: 0.5;
		cursor: default;
	}
	.swatch {
		display: block;
		width: 26px;
		height: 26px;
		border-radius: var(--radius-sm);
		box-shadow: var(--swatch-ring);
	}
	.swatch.small {
		width: 18px;
		height: 18px;
		border-radius: var(--radius-xs);
		flex: none;
	}
	.picker {
		width: 248px;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		gap: var(--space-5);
		padding: var(--space-6);
		background: var(--surface-2);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow);
	}
	.head {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}
	.title {
		font-size: var(--text-control);
		font-weight: var(--fw-semibold);
		color: var(--ink);
	}
	.x {
		display: flex;
		padding: var(--space-1);
		border: 0;
		background: none;
		color: var(--ink-2);
		border-radius: var(--radius-sm);
		cursor: pointer;
	}
	.x:hover {
		color: var(--ink);
	}
	.shade {
		position: relative;
		height: 150px;
		flex: none;
		border-radius: var(--radius-md);
		cursor: crosshair;
		touch-action: none;
		background:
			linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, transparent),
			var(--hue);
	}
	.hue {
		position: relative;
		height: 12px;
		flex: none;
		border-radius: var(--radius-pill);
		cursor: pointer;
		touch-action: none;
		background: linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00);
	}
	.thumb {
		position: absolute;
		width: 16px;
		height: 16px;
		border-radius: 50%;
		border: 2px solid #fff;
		box-shadow:
			0 0 0 1px rgba(0, 0, 0, 0.45),
			0 1px 3px rgba(0, 0, 0, 0.4);
		transform: translate(-50%, -50%);
	}
	.hue .thumb {
		top: 50%;
	}
	.theme {
		display: grid;
		grid-template-columns: repeat(10, 1fr);
		gap: var(--space-2);
	}
	.chip {
		aspect-ratio: 1;
		padding: 0;
		border: 0;
		border-radius: var(--radius-xs);
		box-shadow: var(--swatch-ring);
		cursor: pointer;
	}
	.chip[aria-pressed='true'] {
		outline: 2px solid var(--ink);
		outline-offset: 1px;
	}
	.hexrow {
		display: flex;
		align-items: center;
		gap: var(--space-4);
		background: var(--inset);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		padding: var(--space-2) var(--space-4) var(--space-2) var(--space-3);
	}
	/* Two classes, so a host's `.field input` box never draws inside this row's own. */
	.hexrow .hex {
		flex: 1;
		min-width: 0;
		padding: 0;
		border: 0;
		background: none;
		color: var(--ink);
		font: inherit;
		font-size: var(--text-control);
		font-variant-numeric: tabular-nums;
	}
	.foot {
		display: flex;
		justify-content: space-between;
	}
	.back {
		display: flex;
		gap: var(--space-3);
	}
</style>

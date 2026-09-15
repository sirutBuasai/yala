<script lang="ts">
	// One card label, and the pencil that renames it in place. Inline content only, so the field inherits
	// the type it replaces. Only the words are editable: a label's derived half sits in front of the field
	// as ghost text, so the period or count can't be typed over.
	import type { Snippet } from 'svelte';
	import Pencil from '$lib/icons/Pencil.svelte';
	import { labelGhost, labelText, type Label } from './label';

	interface Props {
		label: Label;
		/** Absent when this label is the app's to name. Empty text hides this half, leaving what the app
		    derives. */
		onrename?: (text: string) => void;
		/** What the pencil and the field announce themselves as renaming. */
		what: string;
		/** Rendered between the label and its pencil, so a tally stays part of the phrase. */
		after?: Snippet;
		/** What this slot's two halves read with, unless the label names its own. */
		join?: string;
		/** This label as the app declares it — what a reset goes back to. Its words stand in the empty field,
		    so typing them back is the undo. Passed whole, so no caller needs to know which half that is. */
		shipped?: Label;
	}
	let { label, onrename, what, after, join = ' ', shipped }: Props = $props();

	const placeholder = $derived(shipped?.text);

	const ghost = $derived(labelGhost(label, join));
	const shown = $derived(labelText(label, join));

	let editing = $state(false);
	let draft = $state('');
	let field = $state<HTMLInputElement>();

	/** As wide as whatever is showing: sized from the draft alone, an emptied label clipped the placeholder
	    telling you what it used to say. Capped at the card below, since the card cannot grow to meet it. */
	const width = $derived(Math.max(6, (draft || placeholder || '').length + 1));

	function open(): void {
		draft = label.text ?? '';
		editing = true;
	}

	function commit(): void {
		if (!editing) return;
		editing = false;
		const next = draft.trim();
		if (next !== (label.text ?? '')) onrename?.(next);
	}

	// Selected, not just focused: renaming usually replaces the name, and a caret at the end makes you
	// clear it first.
	$effect(() => {
		if (editing) field?.select();
	});
</script>

{#if editing}
	{#if ghost}<span class="ghost">{ghost}</span>{/if}
	<input
		bind:this={field}
		class="name"
		type="text"
		aria-label={`Rename ${what}`}
		{placeholder}
		bind:value={draft}
		style:width="min({width}ch, 100%)"
		onblur={commit}
		onkeydown={(e) => {
			if (e.key === 'Enter') commit();
			if (e.key === 'Escape') editing = false;
		}}
	/>
{:else}
	{shown}{@render after?.()}{#if onrename}<button
			type="button"
			class="pencil"
			aria-label={`Rename ${what}`}
			onclick={open}
		>
			<Pencil />
		</button>{/if}
{/if}

<style>
	/* Lifted over the edit-mode drag surface that covers the card (see `grid/Pane`), or the press meant to
	   put a caret in a label starts moving the pane. The rest of the header stays under it, so a card can
	   still be dragged by its title. */
	.pencil,
	.name {
		position: relative;
		z-index: 3;
	}
	.pencil {
		margin-inline-start: 0.35em;
		padding: 0;
		border: 0;
		background: none;
		color: var(--ink-3);
		cursor: pointer;
		vertical-align: baseline;
	}
	.pencil:hover {
		color: var(--ink);
	}
	.ghost,
	.name::placeholder {
		color: var(--ink-3);
		white-space: pre;
	}
	/* Not italic and not faded further: it stands where the words would, saying what they were. */
	.name::placeholder {
		opacity: 1;
	}
	/* No box and no rule, so nothing moves or restyles on the way into edit. Deliberately not `.field`,
	   the app's form-field wrapper, which lays its contents out as a flex column.

	   `min-width: 0` with the `ch` floor left to the inline width: an input's min-content width is the
	   width it was given, and `.kpi` is sized `min-content`, so a field wide enough for a long caption
	   widened the card and the out-of-flow underlay chart painted over the board. A percentage cap alone
	   won't do — percentages don't apply while an ancestor is being sized intrinsically. */
	.name {
		display: inline-block;
		vertical-align: baseline;
		font: inherit;
		color: inherit;
		min-width: 0;
		padding: 0;
		border: 0;
		border-radius: 0;
		background: none;
	}
	/* The selection and caret say where you are; a ring would draw the box this deliberately has not got.
	   Focus is always deliberate: the field exists only once its pencil is pressed. */
	.name:focus-visible {
		outline: none;
	}
</style>

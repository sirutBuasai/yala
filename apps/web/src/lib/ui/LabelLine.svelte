<script lang="ts">
	// One card label, and the pencil that renames it in place. Inline content only, so the field inherits
	// exactly the type it replaces. Only the words are editable: a label's derived half sits in front of
	// the field as ghost text, which is what keeps the period or count from being typed over.
	import type { Snippet } from 'svelte';
	import Pencil from '$lib/icons/Pencil.svelte';
	import { labelGhost, labelText, type Label } from './label';

	interface Props {
		label: Label;
		/** Absent when this label is the app's to name. Empty hides this half, leaving whatever the app
		    derives — a caption cleared to nothing under a period still reads as the period. */
		onrename?: (text: string) => void;
		/** What the pencil and the field announce themselves as renaming. */
		what: string;
		/** Rendered between the label and its pencil, so a tally stays part of the phrase. */
		after?: Snippet;
		/** What this slot's two halves read with, unless the label names its own. */
		join?: string;
		/** This label as the app itself declares it — the value a reset goes back to. Its words stand in the
		    empty field, so a half you hid still says what it would have said, and typing them back is the
		    undo. Passed whole rather than pre-read, so nothing else has to know which half that is. */
		shipped?: Label;
	}
	let { label, onrename, what, after, join = ' ', shipped }: Props = $props();

	const placeholder = $derived(shipped?.text);

	const ghost = $derived(labelGhost(label, join));
	const shown = $derived(labelText(label, join));

	let editing = $state(false);
	let draft = $state('');
	let field = $state<HTMLInputElement>();

	/** The field is as wide as whatever it is SHOWING: sized from the draft alone, an emptied label clipped
	    the placeholder that was telling you what it used to say. */
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

	// Selected, not just focused: renaming usually means replacing the name, and the caret at the end
	// makes you clear it first.
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
		style:width="{width}ch"
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
	/* Both the pencil and the field are LIFTED, because in edit mode a drag surface covers the whole card
	   (see `grid/Pane`): without this the press that should put a caret in a label starts moving the pane
	   instead. The rest of the header is left under it, so a card can still be dragged by its title. */
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
	/* Not italic and not faded further: it stands exactly where the words would, saying what they were. */
	.name::placeholder {
		opacity: 1;
	}
	/* No box and no rule: the label is edited as the label, so nothing about it moves or restyles on the
	   way into edit. Inherits the type it stands in for. NOT `.field`, which is the app's form-field
	   wrapper and lays its contents out as a flex column — the field took its own line. */
	.name {
		display: inline-block;
		vertical-align: baseline;
		font: inherit;
		color: inherit;
		min-width: 6ch;
		max-width: 100%;
		padding: 0;
		border: 0;
		border-radius: 0;
		background: none;
	}
	/* The selection and the caret say where you are; a ring would draw the box this deliberately has not
	   got. Focus is always deliberate here — the field exists only once its pencil is pressed. */
	.name:focus-visible {
		outline: none;
	}
</style>

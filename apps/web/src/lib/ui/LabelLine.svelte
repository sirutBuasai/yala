<script lang="ts">
	// A `contenteditable`, not an `<input>`, which scrolls its overflow and hid a wrapped title from the fit
	// check. No pencil beside it, or the pane's minimum would depend on whether the board is being edited.
	import type { Snippet } from 'svelte';
	import { LABEL_MAX, labelGhost, labelText, type Label } from './label';
	import { selectContents } from '$lib/utils/selection';

	interface Props {
		label: Label;
		/** Absent when this label is the app's to name. Empty text hides this half, leaving what the app
		    derives. */
		onrename?: (text: string) => void;
		/** What the label and the field announce themselves as renaming. */
		what: string;
		/** Rendered after the label, so a tally stays part of the phrase but outside what a click edits. */
		after?: Snippet;
		/** What this slot's two halves read with, unless the label names its own. */
		join?: string;
		/** An emptied label keeps a small box in both modes: without it nothing is left to click, and only while
		    editing would change the card's measured width. */
		nameable?: boolean;
		/** This label as the app declares it — what a reset goes back to. Its words stand in the empty field,
		    so typing them back is the undo. Passed whole, so no caller needs to know which half that is. */
		shipped?: Label;
	}
	let { label, onrename, what, after, join = ' ', shipped, nameable = false }: Props = $props();

	const placeholder = $derived(shipped?.text);

	const ghost = $derived(labelGhost(label, join));
	const shown = $derived(labelText(label, join));

	let editing = $state(false);
	let draft = $state('');
	let field = $state<HTMLElement>();

	function open(): void {
		draft = label.text ?? '';
		editing = true;
	}

	/** One line of plain text, whatever was typed or pasted: the words are a label, not a paragraph. */
	const clean = (text: string) => text.replace(/\s+/g, ' ').trim();

	/** A backstop against pathological input, not the limit a user meets: how long a label may be is the
	    card's business, and the pane puts back words its card cannot hold (see `grid/labelDraft`). */
	function onBeforeInput(e: InputEvent): void {
		if (e.inputType.startsWith('insert') && draft.length >= LABEL_MAX) e.preventDefault();
	}

	function commit(): void {
		if (!editing) return;
		editing = false;
		const next = clean(draft);
		if (next !== (label.text ?? '')) onrename?.(next);
	}

	/** Selected, since a rename usually replaces the name. Focused explicitly: a selection in a
	    `contenteditable` doesn't focus it, and the pane follows focus events. */
	$effect(() => {
		if (!editing || !field) return;
		field.focus();
		selectContents(field);
	});
</script>

{#if editing}
	{#if ghost}<span class="ghost">{ghost}</span>{/if}
	<span
		bind:this={field}
		bind:textContent={draft}
		class="name"
		contenteditable="plaintext-only"
		role="textbox"
		tabindex="0"
		aria-label={`Rename ${what}`}
		data-placeholder={placeholder}
		onbeforeinput={onBeforeInput}
		onblur={commit}
		onkeydown={(e) => {
			if (e.key === 'Enter') {
				// Or the browser opens a second line in a field that is one line by definition.
				e.preventDefault();
				commit();
			}
			if (e.key === 'Escape') editing = false;
		}}
	></span>
{:else}
	{#if onrename}<span
			class="editable"
			role="button"
			tabindex="0"
			aria-label={`${shown}, rename ${what}`}
			title={`Rename ${what}`}
			onclick={open}
			onkeydown={(e) => {
				if (e.key === 'Enter' || e.key === ' ') {
					e.preventDefault();
					open();
				}
			}}>{shown}</span
		>{:else if nameable}<span class="editable slot">{shown}</span
		>{:else}{shown}{/if}{@render after?.()}
{/if}

<style>
	/* Over the edit-mode drag surface, or a press meant for a caret moves the pane. */
	.editable,
	.name {
		position: relative;
		z-index: 3;
	}
	/* Neither affects layout, so an editable label measures exactly as its plain words. */
	.editable {
		cursor: text;
		text-decoration: underline dotted var(--ink-3);
		text-underline-offset: 0.25em;
		text-decoration-thickness: 1px;
	}
	.editable:hover,
	.editable:focus-visible {
		text-decoration-color: var(--ink);
	}
	/* An emptied label keeps a box to click, held in both modes so neither measures wider than the other.
	   The height stays inside the line box the slot already occupies, so it costs nothing either. */
	.editable:empty {
		display: inline-block;
		min-width: 4ch;
		min-height: 1em;
		vertical-align: baseline;
	}
	/* An emptied label has no word to underline, so the box shows itself; tint and inset rule add no size. */
	.editable:empty:not(.slot) {
		border-radius: var(--radius-sm);
		background: color-mix(in srgb, var(--ink-3) 12%, transparent);
		box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--ink-3) 35%, transparent);
	}
	.editable:empty:not(.slot):hover,
	.editable:empty:not(.slot):focus-visible {
		background: color-mix(in srgb, var(--ink-3) 20%, transparent);
		box-shadow: inset 0 0 0 1px var(--ink-3);
	}
	/* The same box standing empty where the label is not this mode's to edit: reserved, never marked. */
	.slot {
		text-decoration: none;
		cursor: inherit;
	}
	.editable:focus-visible {
		outline: none;
	}
	.ghost,
	.name:empty::before {
		color: var(--ink-3);
		white-space: pre;
	}
	/* Not italic and not faded further: it stands where the words would, saying what they were. */
	.name:empty::before {
		content: attr(data-placeholder);
	}
	/* Not `.field`, which lays out as a flex column. No width, so the field can't widen the card. */
	.name {
		font: inherit;
		color: inherit;
		outline: none;
	}
</style>

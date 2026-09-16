<script lang="ts">
	// One card label, renamed by clicking the words themselves. The field IS the words: an inline
	// `contenteditable`, so it wraps exactly where the finished label will and the pane can grow with it as it
	// is typed. An `<input>` cannot — it scrolls its own overflow, so a title long enough to wrap left the
	// card reporting that everything still fitted. Only the words are editable: a label's derived half sits in
	// front of the field as ghost text, so the period or count can't be typed over.
	//
	// The words are the control because the pane's own minimum is measured off this content: a pencil beside
	// them, however it was positioned, either widened the line or overflowed it, and either way a card's
	// smallest size came to depend on whether the board was being edited.
	import type { Snippet } from 'svelte';
	import { LABEL_MAX, labelGhost, labelText, type Label } from './label';

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
		/** This slot is one the user names, whether or not it is being edited now. An emptied label then keeps
		    a small box in both modes: without it there is nothing left to click to get the label back, and
		    reserving it only while editing would make the card measure wider in one mode than the other. */
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
	    card's business, and the pane puts back words its card cannot hold (see `grid/Pane`). */
	function onBeforeInput(e: InputEvent): void {
		if (e.inputType.startsWith('insert') && draft.length >= LABEL_MAX) e.preventDefault();
	}

	function commit(): void {
		if (!editing) return;
		editing = false;
		const next = clean(draft);
		if (next !== (label.text ?? '')) onrename?.(next);
	}

	/** Select the words rather than just focusing them: renaming usually replaces the name, and a caret at the
	    end makes you clear it first. Focused explicitly, because placing a selection inside a `contenteditable`
	    does not focus it — and the pane follows this edit by the field's own focus events. */
	$effect(() => {
		if (!editing || !field) return;
		field.focus();
		const range = document.createRange();
		range.selectNodeContents(field);
		const selection = getSelection();
		selection?.removeAllRanges();
		selection?.addRange(range);
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
	/* Lifted over the edit-mode drag surface that covers the card (see `grid/Pane`), or the press meant to
	   put a caret in a label starts moving the pane. The rest of the header stays under it, so a card can
	   still be dragged by its title. */
	.editable,
	.name {
		position: relative;
		z-index: 3;
	}
	/* An underline and a text cursor, which is as much as an editable word needs to say. Both are free: a
	   decoration draws inside the line box and a cursor is not layout, so an editable label measures exactly
	   as the same words do when they are not. */
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
	/* An underline needs a word to sit under, so an emptied label has to show the box itself or there is
	   nothing to tell the user the slot is theirs to fill. Drawn as a tint and an inset rule, both of which
	   paint inside the box the slot already holds — a border would have added a pixel to it. */
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
	/* Inline and unstyled, so nothing moves or restyles on the way into edit and the words wrap where they
	   always did. Deliberately not `.field`, the app's form-field wrapper, which lays its contents out as a
	   flex column. Nothing sets a width: the field is text, so it takes the width text takes — which is also
	   why it can no longer widen the card the way a sized input once did. */
	.name {
		font: inherit;
		color: inherit;
		outline: none;
	}
</style>

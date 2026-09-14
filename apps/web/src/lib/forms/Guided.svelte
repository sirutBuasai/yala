<script module lang="ts">
	import type { Snippet } from 'svelte';

	/** One question in a guided flow. */
	export interface GuidedStep {
		/** Stable key, so a review can send the user back to the step that answered a row. */
		key: string;
		q: string;
		sub?: string;
		/** What refuses Next, as a full sentence — checked on the way out of the step, so a problem is
		    reported while its own fields are still on screen. */
		problem?: () => string | null;
		/**
		 * Outside the numbering. For a question that decides the SHAPE of the flow — how many questions
		 * there are and which — since before it is answered there is no total to count towards. The
		 * numbering starts at the step after it.
		 */
		uncounted?: boolean;
		/**
		 * As far as the flow goes: there is nothing to answer and no way forward, only out. Its footer
		 * is a single dismissal rather than Back and Next.
		 */
		terminal?: boolean;
		body: Snippet;
	}
</script>

<script lang="ts">
	// A form asked as questions: one on screen at a time, and a review at the end that can jump back to
	// any of them. Which questions there are is the caller's business, so two flows sharing no field can
	// still be the same shape.
	import Overlay from '$lib/overlay/Overlay.svelte';
	import SaveFeedback from '$lib/forms/SaveFeedback.svelte';
	import type { SaveState } from '$lib/forms/saveState.svelte';

	interface Props {
		/** Small label over the title; the step count is appended while there is one to give. */
		kicker: string;
		title: string;
		/** The questions before the review. A list that GROWS once an early answer reveals more steps is
		    expected — the position is clamped rather than reset, so nobody is thrown back to the start. */
		steps: GuidedStep[];
		/** The last step: what is about to happen, in the caller's words. `jump` sends the user back to
		    a step by key, which is what makes every line on it editable. */
		review: Snippet<[(key: string) => void]>;
		reviewQuestion?: string;
		reviewSub?: string;
		confirmLabel: string;
		/** Draws the confirm as destructive. The review IS the confirmation, so there is no second one. */
		danger?: boolean;
		save: SaveState;
		/** The step on screen. Bindable so answering can advance — picking from a list of choices means
		    "this one, next question", not "this one, now press Next". */
		at?: number;
		onsubmit: () => void;
		onclose: () => void;
		accent?: string;
		accentText?: string;
	}
	let {
		kicker,
		title,
		steps,
		review,
		reviewQuestion = 'Does this look right?',
		reviewSub = 'Nothing is saved until you confirm it.',
		confirmLabel,
		danger = false,
		save,
		at = $bindable(0),
		onsubmit,
		onclose,
		accent = 'var(--lav)',
		accentText = 'var(--lav-text)'
	}: Props = $props();

	/** The review sits one past the last question; it takes no entry in `steps` because the caller
	    renders it, but it IS the last step of the flow and counts as one. */
	const last = $derived(steps.length);
	const here = $derived(Math.min(at, last));
	const step = $derived<GuidedStep | undefined>(steps[here]);
	const reviewing = $derived(here === last);

	/** The steps that carry a number: everything but the shape-deciding ones, plus the review. */
	const numbered = $derived(steps.filter((s) => !s.uncounted));
	const total = $derived(numbered.length + 1);

	/** Where we are in that count, or null on a step that sits outside it. */
	const place = $derived.by(() => {
		if (reviewing) return total;
		if (!step || step.uncounted) return null;
		return numbered.indexOf(step) + 1;
	});

	/** One step is not a sequence, so it is neither counted nor drawn as progress. */
	const counted = $derived(total > 1 && place != null);

	let body = $state<HTMLDivElement>();

	// Land the caret in the first box of each question, so a keyboard user answers without tabbing in.
	// A text field only: focusing a choice would arm it.
	$effect(() => {
		here;
		body?.querySelector<HTMLInputElement>('input:not([type="checkbox"])')?.focus();
	});

	function go(to: number) {
		save.reset();
		at = Math.max(0, Math.min(to, last));
	}

	function next() {
		if (reviewing) return onsubmit();
		const problem = step?.problem?.();
		if (problem) return void save.fail(problem);
		go(here + 1);
	}

	/** Back to the step that answered one row of the review. Unknown keys are ignored rather than
	    throwing: a review may list a derived row that no step owns. */
	function jump(key: string) {
		const found = steps.findIndex((s) => s.key === key);
		if (found >= 0) go(found);
	}
</script>

<Overlay
	{title}
	kicker={counted ? `${kicker} · step ${place} of ${total}` : kicker}
	{accent}
	{accentText}
	{onclose}
>
	{#snippet controls()}
		<!-- One segment per numbered step, the review's included. -->
		{#if counted}
			<div class="progress" role="presentation">
				{#each { length: total } as _, i (i)}
					<i class:done={i < (place ?? 0) - 1} class:now={i === (place ?? 0) - 1}></i>
				{/each}
			</div>
		{/if}
	{/snippet}

	<!-- Enter answers the question, as it would in a one-field form. A button target is left alone:
	     Enter already activates the button under the caret. -->
	<div
		bind:this={body}
		class="gbody"
		role="presentation"
		onkeydown={(e) => {
			if (e.key === 'Enter' && !(e.target instanceof HTMLButtonElement)) {
				e.preventDefault();
				next();
			}
		}}
	>
		<h3 class="q serif">{reviewing ? reviewQuestion : step?.q}</h3>
		<p class="sub">{reviewing ? reviewSub : (step?.sub ?? '')}</p>

		{#if reviewing}
			{@render review(jump)}
		{:else if step}
			{@render step.body()}
		{/if}
	</div>

	<!-- The footer comes from the step, not from every step assuming it has a Next: a terminal one has
	     nowhere to go and offers only the way out. -->
	<div class="foot">
		<span class="feedback"><SaveFeedback {save} /></span>
		{#if step?.terminal}
			<button type="button" class="btn-primary" onclick={onclose}>Close</button>
		{:else}
			{#if here > 0}
				<button type="button" class="btn-cancel" disabled={save.busy} onclick={() => go(here - 1)}>
					Back
				</button>
			{/if}
			<button
				type="button"
				class={danger && reviewing ? 'btn-danger' : 'btn-primary'}
				disabled={save.busy}
				onclick={next}
			>
				{reviewing ? confirmLabel : 'Next'}
			</button>
		{/if}
	</div>
</Overlay>

<style>
	.progress {
		display: flex;
		align-items: center;
		gap: var(--space-3);
	}
	.progress i {
		height: 3px;
		flex: 1;
		border-radius: var(--radius-pill);
		background: color-mix(in srgb, var(--ink-3) 30%, transparent);
	}
	.progress i.done {
		background: var(--accent, var(--lav));
	}
	.progress i.now {
		background: var(--accent, var(--lav));
		opacity: 0.55;
	}
	/* A floor, so the panel doesn't resize under the buttons as the questions change height. */
	.gbody {
		min-height: 13rem;
	}
	.q {
		font-size: var(--text-title);
		letter-spacing: var(--ls-tight);
		margin: 0 0 var(--space-2);
	}
	.sub {
		font-size: var(--text-secondary);
		color: var(--ink-3);
		margin: 0 0 var(--space-10);
	}
	.foot {
		display: flex;
		align-items: center;
		gap: var(--gap-inline);
		justify-content: flex-end;
		border-top: 1px solid var(--border);
		padding-top: var(--space-8);
		margin-top: var(--space-10);
	}
	/* Takes the slack so the buttons stay put whether or not there is a message. */
	.feedback {
		flex: 1;
		min-width: 0;
	}
</style>

<script module lang="ts">
	import type { Tone as Verdict } from '$lib/data/primitives';

	/** Named by MEANING, not colour, so a tone can be re-themed without renaming call sites. */
	export type Tone = 'neutral' | 'good' | 'warn' | 'crit' | 'accent';

	/** A figure's good-or-bad-news as a badge tone. No verdict means no colour, not good news. */
	export function badgeTone(verdict: Verdict | undefined): Tone {
		return verdict === 'good' ? 'good' : verdict === 'bad' ? 'crit' : 'neutral';
	}
</script>

<script lang="ts">
	// The one small status pill: pending flags, checklist verdicts, counts. They differ only in tone
	// and whether they carry a dot, so that is what the props are.
	import type { Snippet } from 'svelte';

	interface Props {
		tone?: Tone;
		/** Lead with a filled dot — for a state that is ongoing rather than a verdict. */
		dot?: boolean;
		/** Draw the tone as a tinted, outlined chip rather than as bare coloured text. */
		filled?: boolean;
		title?: string;
		children: Snippet;
	}
	let { tone = 'neutral', dot = false, filled = false, title, children }: Props = $props();
</script>

<span class="badge {tone}" class:filled {title}>
	{#if dot}<span class="dot" aria-hidden="true">●</span>{/if}{@render children()}
</span>

<style>
	.badge {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		flex: none;
		font-size: var(--text-badge);
		font-weight: var(--fw-semibold);
		white-space: nowrap;
	}
	.dot {
		font-size: 0.8em;
		line-height: 1;
	}
	.neutral {
		color: var(--ink-3);
	}
	.good {
		color: var(--good-text);
	}
	.warn {
		color: var(--gold-text);
	}
	.crit {
		color: var(--crit-text);
	}
	.accent {
		color: var(--lav-text);
	}
	/* The filled variant adds the chip: the tone tinted behind, its own colour on the border. */
	.filled {
		border: 1px solid transparent;
		border-radius: var(--radius-pill);
		padding: 0 var(--space-3);
		font-weight: var(--fw-bold);
	}
	.filled.neutral {
		background: color-mix(in srgb, var(--ink-3) 15%, transparent);
		border-color: color-mix(in srgb, var(--ink-3) 40%, transparent);
	}
	.filled.good {
		background: color-mix(in srgb, var(--good) 15%, transparent);
		border-color: color-mix(in srgb, var(--good) 40%, transparent);
	}
	.filled.warn {
		background: color-mix(in srgb, var(--gold) 18%, transparent);
		border-color: color-mix(in srgb, var(--gold) 42%, transparent);
	}
	.filled.crit {
		background: color-mix(in srgb, var(--crit) 15%, transparent);
		border-color: color-mix(in srgb, var(--crit) 45%, transparent);
	}
	.filled.accent {
		background: color-mix(in srgb, var(--lav) 18%, transparent);
		border-color: color-mix(in srgb, var(--lav) 42%, transparent);
	}
</style>

<script lang="ts">
	// A change riding beside a figure. The one place a delta becomes a badge, so its tone, its wording and the
	// tooltip a shortened reading needs are answered the same way wherever one appears.
	import { deltaLabel, type DeltaDetail, type Scalar } from '$lib/data/primitives';
	import Badge, { badgeTone } from '$lib/ui/Badge.svelte';

	interface Props extends DeltaDetail {
		delta: NonNullable<Scalar['delta']>;
	}
	let { delta, digits, note }: Props = $props();

	const shown = $derived(deltaLabel(delta, { digits, note }));
	const full = $derived(deltaLabel(delta));
	/** Only where the reading was shortened, so a badge showing everything announces nothing twice. */
	const spoken = $derived(shown === full ? undefined : full);
</script>

<Badge tone={badgeTone(delta.tone)} title={spoken} label={spoken}>{shown}</Badge>

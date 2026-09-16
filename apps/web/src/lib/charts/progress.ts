// A figure read against the level it is judged by, shared by every track that draws one.
//
// The track's end IS the target, so two tracks measured in different units still compare. Never scaled to
// the value: a track stretched to whatever was furthest out drew a wildly overshooting figure and a
// nearly-met one as the same nearly-full bar.

/** How far along its target a figure sits, or null where there is nothing to draw. */
export interface Fill {
	/** A CSS width, held to the track. */
	width: string;
	/** Past the target, which the track cannot show by growing. */
	over: boolean;
	reached: boolean;
}

export function fillTo(value: number | null | undefined, target: number): Fill | null {
	if (value == null || !target) return null;

	const share = (value / target) * 100;
	return {
		width: `${Math.min(100, Math.max(0, share))}%`,
		over: share > 100,
		reached: share >= 100
	};
}

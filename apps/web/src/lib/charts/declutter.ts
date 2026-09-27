// Labels stacked beside a chart's edge, each pinned near the point it names but never on top of another.

/** Each label's position given where it wants to sit: pushed down past the one above in one pass, then back
    up from `bottom` if the stack overruns it. Returned in the order given. */
export function declutter(wanted: number[], gap: number, top: number, bottom: number): number[] {
	const order = wanted.map((at, i) => ({ i, at })).sort((a, b) => a.at - b.at);
	let last = -Infinity;
	for (const o of order) {
		o.at = Math.max(o.at, last + gap, top);
		last = o.at;
	}
	if ((order.at(-1)?.at ?? bottom) > bottom) {
		last = bottom + gap;
		for (let k = order.length - 1; k >= 0; k--) {
			order[k]!.at = Math.min(order[k]!.at, last - gap);
			last = order[k]!.at;
		}
	}
	const out = new Array<number>(wanted.length);
	for (const o of order) out[o.i] = o.at;
	return out;
}

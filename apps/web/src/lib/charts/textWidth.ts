// Chart label widths, measured in the font the labels are drawn in. Laying labels out by a per-glyph
// estimate overlapped them wherever the real font ran wider. Measured in the DOM, not on a canvas: Firefox's
// canvas resolved the system font stack to a narrower face than its pages draw in.

const GLYPH_W = 6.2;

/** How a label is drawn: a type-size token and a weight, axis type by default. */
export interface LabelType {
	size?: '--text-axis' | '--text-caption' | '--text-micro';
	weight?: number;
}

let probe: HTMLElement | undefined;
const measured = new Map<string, number>();

function measurer(): HTMLElement {
	if (!probe) {
		probe = document.createElement('span');
		probe.className = 'probe';
		probe.style.cssText = 'width:auto;height:auto;white-space:pre;font-family:var(--font-body)';
		probe.setAttribute('aria-hidden', 'true');
		document.body.append(probe);
	}
	return probe;
}

/** px `text` takes in chart label type. Where nothing lays text out, as under test, an estimate. */
export function textWidth(
	text: string,
	{ size = '--text-axis', weight = 400 }: LabelType = {}
): number {
	const key = `${size}|${weight}|${text}`;
	let width = measured.get(key);
	if (width === undefined) {
		const el = measurer();
		el.style.fontSize = `var(${size})`;
		el.style.fontWeight = String(weight);
		el.textContent = text;
		width = el.getBoundingClientRect().width || text.length * GLYPH_W;
		if (el.getBoundingClientRect().width) measured.set(key, width);
	}
	return width;
}

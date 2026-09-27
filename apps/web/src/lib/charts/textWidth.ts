// Chart label widths, measured in the font the labels are drawn in. Laying labels out by a per-glyph
// estimate overlapped them wherever the real font ran wider; the estimate stays only where nothing can
// measure, as under test.

const GLYPH_W = 6.2;

let context: OffscreenCanvasRenderingContext2D | null | undefined;
const measured = new Map<string, number>();

/** The canvas that measures, set to the axis font once the stylesheet has declared it. */
function measurer(): OffscreenCanvasRenderingContext2D | null {
	if (context !== undefined) return context;
	if (typeof OffscreenCanvas === 'undefined') return (context = null);
	const style = getComputedStyle(document.documentElement);
	const [size, family] = ['--text-axis', '--font-body'].map((v) =>
		style.getPropertyValue(v).trim()
	);
	if (!size || !family) return null;
	context = new OffscreenCanvas(1, 1).getContext('2d');
	if (context) context.font = `${size} ${family}`;
	return context;
}

/** px `text` takes in chart axis type. */
export function textWidth(text: string): number {
	const canvas = measurer();
	if (!canvas) return text.length * GLYPH_W;
	let width = measured.get(text);
	if (width === undefined) {
		width = canvas.measureText(text).width;
		measured.set(text, width);
	}
	return width;
}

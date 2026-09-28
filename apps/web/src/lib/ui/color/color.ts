// Colour maths for the picker and its suggestions. Every colour is a lowercase `#rrggbb`, the one form
// the settings file stores.

/** The Kanagawa / Tokyo-Night hues the app's own tokens come from, so a suggestion always sits on theme. */
export const THEME_COLORS = [
	'#bb9af7',
	'#f7768e',
	'#9ece6a',
	'#7dcfff',
	'#e0af68',
	'#ff9e64',
	'#6f8fe8',
	'#4cc9b0',
	'#de85c8',
	'#c56b9a',
	'#f295c5',
	'#ffd27f',
	'#2bb673',
	'#ffd5d2',
	'#c0794f',
	'#7e9cd8',
	'#957fb8',
	'#98bb6c',
	'#7fb4ca',
	'#e46876',
	'#ffa066',
	'#6a9589',
	'#d27e99',
	'#c0a36e',
	'#658594',
	'#b4f4ff',
	'#4a6f9e',
	'#639cc3',
	'#d94c4c',
	'#73daca'
];

const HEX = /^#[0-9a-f]{6}$/;

/** A typed colour as the stored form, or null if it isn't a hex literal. Takes `#rgb` and any case. */
export function parseHex(typed: string): string | null {
	const t = typed.trim().toLowerCase();
	const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(t);
	const full = short ? `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}` : t;
	return HEX.test(full) ? full : null;
}

function channels(hex: string): [number, number, number] {
	const n = parseInt(hex.slice(1), 16);
	return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/** Hue in degrees, saturation and value in 0—1. */
export interface Hsv {
	h: number;
	s: number;
	v: number;
}

export function toHsv(hex: string): Hsv {
	const [r, g, b] = channels(hex);
	const max = Math.max(r, g, b);
	const d = max - Math.min(r, g, b);
	let h = 0;
	if (d) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
	return { h: (h * 60 + 360) % 360, s: max ? d / max : 0, v: max };
}

export function toHex({ h, s, v }: Hsv): string {
	const f = (n: number) => {
		const k = (n + h / 60) % 6;
		return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
	};
	return (
		'#' +
		[f(5), f(3), f(1)]
			.map((x) =>
				Math.round(x * 255)
					.toString(16)
					.padStart(2, '0')
			)
			.join('')
	);
}

function oklab(hex: string): [number, number, number] {
	const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
	const [r, g, b] = channels(hex).map(lin) as [number, number, number];
	const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
	const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
	const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
	return [
		0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
		1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
		0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
	];
}

/** How different two colours look, rather than how far apart their channel numbers are. */
export function perceivedDistance(a: string, b: string): number {
	const [x, y] = [oklab(a), oklab(b)];
	return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
}

/** Theme colours nobody in `used` has, picked one at a time as the one furthest from every colour in
    use and every earlier pick, so each is the hardest to confuse with the rest. */
export function suggestions(used: Iterable<string>, count = 5): string[] {
	const taken = [...new Set(used)];
	const pool = THEME_COLORS.filter((c) => !taken.includes(c));
	const picks: string[] = [];

	while (picks.length < count && pool.length) {
		const against = [...taken, ...picks];
		const nearest = (c: string) =>
			against.length ? Math.min(...against.map((t) => perceivedDistance(c, t))) : 0;
		let best = 0;
		for (let i = 1; i < pool.length; i++) {
			if (nearest(pool[i]!) > nearest(pool[best]!)) best = i;
		}
		picks.push(...pool.splice(best, 1));
	}

	return picks;
}

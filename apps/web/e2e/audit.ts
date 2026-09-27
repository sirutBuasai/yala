// The layout audit, as a function the browser runs. Everything here executes inside the page, so it may
// not close over anything from the test file.

export interface Finding {
	by: number;
	card: string;
	el: string;
}

export interface Clip {
	el: string;
	dx: number;
	dy: number;
}

export interface Audit {
	pageOverflowX: number;
	bleed: Finding[];
	clipped: Clip[];
	overlap: { a: string; b: string }[];
}

/** Ink outside its box, a label cut by its line budget, or overlapping cards. A box bleeds only if nothing
    between it and the card clips, or every `.scroller-x` would count. */
export function auditPage(tolerance = 2): Audit {
	const describe = (el: Element): string => {
		const cls =
			typeof el.className === 'string' && el.className
				? '.' +
					el.className
						.trim()
						.split(/\s+/)
						.filter((c) => !c.startsWith('s-'))
						.slice(0, 3)
						.join('.')
				: '';
		const text = (el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 44);
		return `${el.tagName.toLowerCase()}${cls} «${text}»`;
	};

	/** The nearest ancestor up to and including `stop` that clips on either axis. */
	const clipper = (el: Element, stop: Element): Element | null => {
		for (let p = el.parentElement; p; p = p.parentElement) {
			const cs = getComputedStyle(p);
			if (cs.overflowX !== 'visible' || cs.overflowY !== 'visible') return p;
			if (p === stop) return p;
			if (!stop.contains(p)) return null;
		}
		return null;
	};

	/** Whether `el` or an ancestor below `card` is placed against the viewport or paints nothing. Its
	    children count too, though their own computed styles say otherwise: a hint's closed bubble. */
	const outOfCard = (el: Element, card: Element): boolean => {
		for (let p: Element | null = el; p && p !== card; p = p.parentElement) {
			const cs = getComputedStyle(p);
			if (cs.position === 'fixed' || cs.opacity === '0') return true;
		}
		return false;
	};

	const bleed: Finding[] = [];
	const clipped: Clip[] = [];
	const overlap: { a: string; b: string }[] = [];

	for (const card of document.querySelectorAll('.card')) {
		const box = card.getBoundingClientRect();
		const name = (card.querySelector('h2')?.textContent ?? '?')
			.trim()
			.replace(/\s+/g, ' ')
			.slice(0, 24);
		for (const el of card.querySelectorAll('*')) {
			const cs = getComputedStyle(el);
			if (cs.display === 'none' || cs.visibility === 'hidden' || outOfCard(el, card)) continue;
			const r = el.getBoundingClientRect();
			if (r.width === 0 || r.height === 0) continue;
			const inner = clipper(el, card);
			if (inner && inner !== card) continue;
			const over = Math.max(
				box.left - r.left,
				r.right - box.right,
				box.top - r.top,
				r.bottom - box.bottom
			);
			if (over > tolerance) bleed.push({ by: Math.round(over), card: name, el: describe(el) });
		}
	}

	for (const el of document.querySelectorAll('[data-label-line]')) {
		const dy = el.scrollHeight - el.clientHeight;
		const dx = el.scrollWidth - el.clientWidth;
		if (dy > tolerance || dx > tolerance) clipped.push({ el: describe(el), dx, dy });
	}

	const cards = [...document.querySelectorAll('.board .cell > .card')].map((c) => ({
		c,
		r: c.getBoundingClientRect()
	}));
	for (let i = 0; i < cards.length; i++) {
		for (let j = i + 1; j < cards.length; j++) {
			const [a, b] = [cards[i]!.r, cards[j]!.r];
			const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left);
			const oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
			if (ox > tolerance && oy > tolerance)
				overlap.push({ a: describe(cards[i]!.c), b: describe(cards[j]!.c) });
		}
	}

	return {
		pageOverflowX: document.documentElement.scrollWidth - window.innerWidth,
		bleed,
		clipped,
		overlap
	};
}

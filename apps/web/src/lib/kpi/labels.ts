// What a KPI is called. One place, because two callers need the same answer: the card that renders the
// labels, and the editor that has to open on the text they would show.

import type { DashboardData } from '$lib/data/types';
import type { Scalar } from '$lib/data/primitives';
import { build } from '$lib/data/catalog';
import type { Label } from '$lib/ui/label';
import type { KpiSpec } from './spec';

/**
 * The catalog's own label and note, with anything the view spelled out overriding them half by half — so
 * a spec that supplies only a `context` still gets the scalar's words behind it.
 */
export function kpiLabels(data: DashboardData, spec: KpiSpec): { title: Label; caption: Label } {
	const scalar = build(data, spec.figure, spec.scope) as Scalar;
	return {
		title: { ...scalar.label, ...spec.title },
		caption: { ...scalar.note, ...spec.caption }
	};
}

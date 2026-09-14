<script lang="ts">
	// One managed account: what it is named, what it is linked to, and the end of its life. Which
	// controls appear comes from the kind capabilities the API sends.
	//
	// Renaming is not a mode: a name is a field like any other and one Save covers the lot. But a rename
	// rewrites the account's path in every entry that mentions it while an alias only shortens what the
	// name renders as, so the two go to different endpoints in a fixed order (see `submit`).
	import {
		relabelAccount,
		renameAccount,
		reopenAccount,
		setAccountMeta,
		setSweep,
		type AccountMeta,
		type AccountTier
	} from '$lib/data/load';
	import { accountDirectory, accountInfo } from '$lib/data/directory.svelte';
	import type { AccountKind } from '$lib/data/types';
	import { DISCARD, NONE, SAVED, SAVE_CHANGES } from '$lib/copy';
	import { SaveState } from '$lib/forms/saveState.svelte';
	import { problems, validateLabel, validateName, validateOptionalName } from '$lib/forms/validate';
	import { dateLong, formatAccount, money } from '$lib/utils/format';
	import Select from '$lib/forms/fields/Select.svelte';
	import SaveFeedback from '$lib/forms/SaveFeedback.svelte';
	import TextField from '$lib/forms/fields/TextField.svelte';
	import TextRows, { rowValues, textRows, type TextRow } from '$lib/forms/fields/TextRows.svelte';
	import Badge from '$lib/ui/Badge.svelte';
	import CloseAccount from '$lib/views/manage/CloseAccount.svelte';
	import NamingFields from '$lib/views/manage/NamingFields.svelte';
	import {
		CLOSE,
		EMPLOYER,
		EVERY_EMPLOYER,
		INSTITUTION,
		INSTITUTION_ALIAS,
		NAME,
		OPTIONS,
		RENAME_HINT,
		SWEEPS_INTO,
		TAX_TREATMENT
	} from '$lib/views/manage/copy';
	import {
		TIERS,
		kindSingular,
		productAliasLabel,
		productLabel,
		tierLabel
	} from '$lib/views/manage/kinds';

	interface Props {
		account: string;
		/** What each kind may carry, as the API describes it. The panel looks its own kind up rather than
		    being told, so a caller never has to know one account's kind from another's. */
		kinds: Record<string, AccountKind>;
		/** Candidate destinations for a sweep or a close, this account excluded by the panel. */
		destinations?: string[];
		/** Active employers, for the scope control. */
		employers?: string[];
		/** Current value, when the account holds one; null for a category or an employer. */
		balance?: number | null;
		onchanged: () => void;
		/** A rename moves the account to a new path, which is where the selection has to follow. */
		onrenamed?: (account: string) => void;
	}
	let {
		account,
		kinds,
		destinations = [],
		employers = [],
		balance = null,
		onchanged,
		onrenamed
	}: Props = $props();

	const save = new SaveState();

	const info = $derived(accountInfo(account));
	const kind = $derived(kinds[info?.kind ?? '']);
	const label = $derived(formatAccount(account));
	const closed = $derived(info?.closed ?? false);
	const dests = $derived(destinations.filter((d) => d !== account));

	/** Other accounts held at this institution, which an institution rename carries along. */
	const alsoHeld = $derived(
		info?.institution_name
			? accountDirectory().filter(
					([other, entry]) => other !== account && entry.institution_name === info.institution_name
				)
			: []
	);

	let name = $state('');
	let institutionName = $state('');
	let accountName = $state('');
	let institutionAlias = $state('');
	let accountAlias = $state('');
	let tier = $state<AccountTier>('Taxable');
	let employer = $state('');
	let sweepSel = $state('');
	let options = $state<TextRow[]>([]);
	let closing = $state(false);

	/** Every box back to what the ledger says. Also the discard. */
	function seed() {
		name = info?.name ?? '';
		institutionName = info?.institution_name ?? '';
		accountName = info?.account_name ?? '';
		institutionAlias = info?.institution_alias ?? '';
		accountAlias = info?.account_alias ?? '';
		tier = info?.tier ?? 'Taxable';
		employer = info?.employer ?? '';
		sweepSel = info?.sweep_to ?? '';
		options = textRows(info?.labels ?? []);
		save.reset();
	}

	// Re-seeded whenever the account or what the ledger says about it changes, so a save's own refresh
	// leaves the boxes agreeing with the ledger.
	$effect(() => {
		info;
		account;
		seed();
	});

	// --- what differs ---

	const typedName = $derived({
		name: name.trim(),
		institution_name: institutionName.trim(),
		account_name: accountName.trim()
	});

	/** The rename, if any: only the parts the kind carries and the boxes actually differ in. A rename
	    is the one edit that rewrites history, so an untouched field is never sent. */
	const renames = $derived.by(() => {
		const out: {
			name?: string;
			institution_name?: string;
			account_name?: string;
			tier?: AccountTier;
		} = {};
		if (kind?.named) {
			if (typedName.institution_name !== (info?.institution_name ?? ''))
				out.institution_name = typedName.institution_name;
			if (kind.product && typedName.account_name !== (info?.account_name ?? ''))
				out.account_name = typedName.account_name;
		} else if (typedName.name !== (info?.name ?? '')) {
			out.name = typedName.name;
		}
		// The tier is a path segment, so moving between tiers is a rename too.
		if (kind?.tiered && tier !== info?.tier) out.tier = tier;
		return out;
	});

	const labels = $derived(rowValues(options));
	const sameList = (a: string[], b: string[]) =>
		a.length === b.length && a.every((x, i) => x === b[i]);

	/** Renaming an option carries its logged history, which is a different write from replacing the
	    offered set — so a row edited in place is a relabel, and one added or removed is not. */
	const relabels = $derived(
		options
			.filter((row) => row.was != null && row.value.trim() && row.value.trim() !== row.was)
			.map((row) => ({ from: row.was!, to: row.value.trim() }))
	);

	const meta = $derived.by(() => {
		const out: AccountMeta = {};
		const alias = (typed: string) => typed.trim() || null;
		if (kind?.named && alias(institutionAlias) !== (info?.institution_alias ?? null))
			out.institution_alias = alias(institutionAlias);
		if (kind?.product && alias(accountAlias) !== (info?.account_alias ?? null))
			out.account_alias = alias(accountAlias);
		if (kind?.scopable && (employer || null) !== (info?.employer ?? null))
			out.employer = employer || null;
		if (kind?.labelled && !sameList(labels, info?.labels ?? [])) out.labels = labels;
		return out;
	});

	const sweepMoved = $derived((kind?.sweeps ?? false) && sweepSel !== (info?.sweep_to ?? ''));
	const dirty = $derived(
		Object.keys(renames).length > 0 ||
			Object.keys(meta).length > 0 ||
			relabels.length > 0 ||
			sweepMoved
	);

	function problem(): string | null {
		const checks = problems();
		if (kind?.named) {
			checks
				.add(validateName(institutionName, INSTITUTION))
				.add(validateOptionalName(institutionAlias, INSTITUTION_ALIAS));
			if (kind.product) {
				checks
					.add(validateName(accountName, productLabel(info?.kind ?? '')))
					.add(validateOptionalName(accountAlias, productAliasLabel(info?.kind ?? '')));
			}
		} else {
			checks.add(validateName(name, NAME));
		}
		for (const option of labels) checks.add(validateLabel(option));
		checks.add(new Set(labels).size === labels.length ? null : OPTIONS.distinct);
		return checks.message() || null;
	}

	/**
	 * One Save for everything on this panel, in the only order that works: a relabel and a meta edit
	 * both address the account by its CURRENT path, so the rename — which changes that path — goes
	 * last. The first failure stops there rather than leaving the rest to report a state nobody asked
	 * for.
	 */
	async function submit() {
		const invalid = problem();
		if (invalid) return save.fail(invalid);

		let moved: string | null = null;
		const ok = await save.run(async () => {
			for (const { from, to } of relabels) {
				const failed = await relabelAccount(account, from, to);
				if (failed) return failed;
			}
			if (Object.keys(meta).length) {
				const failed = await setAccountMeta(account, meta);
				if (failed) return failed;
			}
			if (sweepMoved) {
				const failed = await setSweep(account, sweepSel || null);
				if (failed) return failed;
			}
			if (Object.keys(renames).length) {
				const result = await renameAccount(account, renames);
				moved = result.account;
				return result.error;
			}
			return null;
		}, SAVED);

		if (ok) {
			// Ordered: the selection follows the rename BEFORE the dashboard reloads, or the panel is
			// left pointing at a path that no longer exists and the view falls back to the settings pane.
			if (moved && moved !== account) onrenamed?.(moved);
			onchanged();
		}
	}

	const reopen = () => save.run(() => reopenAccount(account)).then((ok) => ok && onchanged());
</script>

<div class="panel">
	<div class="railed">
		<div class="main">
			<header>
				<h2>{label}</h2>
				{#if info?.kind}<Badge filled>{kindSingular(info.kind)}</Badge>{/if}
				{#if info?.tier}<Badge filled tone="accent">{tierLabel(info.tier)}</Badge>{/if}
				{#if closed}<Badge filled tone="crit">Closed</Badge>{/if}
			</header>

			{#if !kind}
				<p class="cap">This app doesn't manage this account.</p>
			{:else}
				<section class="block">
					<h3>Naming</h3>
					{#if kind.named}
						<NamingFields
							kind={kind.name}
							bind:institutionName
							bind:accountName
							bind:institutionAlias
							bind:accountAlias
							withAccountName={kind.product}
							disabled={save.busy}
						/>
					{:else}
						<TextField
							label={NAME}
							ariaLabel={`Name for ${label}`}
							bind:value={name}
							disabled={save.busy}
						/>
					{/if}
					<p class="hint">{RENAME_HINT}</p>
				</section>

				{#if !closed && (kind.tiered || kind.scopable || kind.sweeps)}
					<section class="block">
						<h3>Placement &amp; links</h3>
						<div class="fields">
							{#if kind.tiered}
								<label class="field">
									<span>{TAX_TREATMENT}</span>
									<Select
										ariaLabel={`${TAX_TREATMENT} for ${label}`}
										bind:value={tier}
										options={TIERS}
										optionLabel={tierLabel}
									/>
								</label>
							{/if}
							{#if kind.scopable}
								<label class="field">
									<span>{EMPLOYER}</span>
									<Select
										ariaLabel={`${EMPLOYER} for ${label}`}
										bind:value={employer}
										options={['', ...employers]}
										optionLabel={(e) => e || (kind.labelled ? NONE : EVERY_EMPLOYER)}
									/>
								</label>
							{/if}
							{#if kind.sweeps}
								<label class="field">
									<span>{SWEEPS_INTO}</span>
									<Select
										ariaLabel={`Sweep destination for ${label}`}
										bind:value={sweepSel}
										options={['', ...dests]}
										optionLabel={(a) => (a ? formatAccount(a) : NONE)}
									/>
								</label>
							{/if}
						</div>
					</section>
				{/if}

				{#if kind.labelled && !closed}
					<section class="block">
						<h3>Contribution options</h3>
						<TextRows
							bind:rows={options}
							header={OPTIONS.header}
							optional
							addLabel={OPTIONS.add}
							noun={OPTIONS.noun}
							placeholder={OPTIONS.placeholder}
							disabled={save.busy}
						/>
					</section>
				{/if}

				<footer>
					<SaveFeedback {save} />
					<div class="acts">
						<button type="button" class="btn-cancel" disabled={save.busy || !dirty} onclick={seed}
							>{DISCARD}</button
						>
						<button
							type="button"
							class="btn-primary"
							disabled={save.busy || !dirty}
							onclick={submit}>{SAVE_CHANGES}</button
						>
					</div>
				</footer>
			{/if}
		</div>

		<aside class="rail">
			<dl class="facts">
				{#if balance != null}
					<div>
						<dt>{info?.kind === 'investment' ? 'Current value' : 'Balance'}</dt>
						<dd class="num">{money(balance)}</dd>
					</div>
				{/if}
				{#if info?.opened}
					<div>
						<dt>Opened</dt>
						<dd>{dateLong(info.opened)}</dd>
					</div>
				{/if}
				<div>
					<dt>Status</dt>
					<dd class:good={!closed}>{closed ? 'Closed' : 'Open'}</dd>
				</div>
				{#if info?.employer}
					<div>
						<dt>Payroll</dt>
						<dd>{info.employer}</dd>
					</div>
				{/if}
				{#if info?.sweep_to}
					<div>
						<dt>{SWEEPS_INTO}</dt>
						<dd>{formatAccount(info.sweep_to)}</dd>
					</div>
				{/if}
				{#if alsoHeld.length}
					<div>
						<dt>Also at</dt>
						<dd>{alsoHeld.map(([, entry]) => entry.name).join(', ')}</dd>
					</div>
				{/if}
			</dl>

			{#if kind}
				<div class="lifecycle">
					{#if closed}
						<button type="button" class="btn-mini wide" disabled={save.busy} onclick={reopen}
							>Reopen account</button
						>
					{:else}
						<button
							type="button"
							class="btn-danger-quiet wide"
							disabled={save.busy}
							onclick={() => (closing = true)}>{CLOSE.kicker}</button
						>
					{/if}
				</div>
			{/if}
		</aside>
	</div>
</div>

{#if closing && kind}
	<CloseAccount
		{account}
		{kind}
		destinations={dests}
		{balance}
		onclose={() => (closing = false)}
		onclosed={onchanged}
	/>
{/if}

<style>
	/* The panel is its own card: each half of the split pads itself, so the rail's background and the
	   divider between them reach the card's edges. */
	.panel {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-xl);
		overflow: hidden;
		min-width: 0;
	}
	.railed {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(13rem, 17rem);
	}
	.main {
		min-width: 0;
		padding: var(--pad-card);
	}
	header {
		display: flex;
		align-items: center;
		gap: var(--gap-inline);
		flex-wrap: wrap;
		margin-bottom: var(--space-6);
	}
	h2 {
		font-family: var(--font-display);
		font-size: var(--text-panel);
		letter-spacing: var(--ls-snug);
		margin: 0;
	}
	h3 {
		font-size: var(--text-label);
		text-transform: uppercase;
		letter-spacing: var(--ls-wider);
		color: var(--ink-3);
		font-weight: var(--fw-semibold);
		margin: 0 0 var(--space-6);
	}
	.block {
		border-top: 1px solid var(--border);
		padding-top: var(--space-8);
		margin-bottom: var(--space-8);
	}
	.fields {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(12rem, 100%), 1fr));
		gap: var(--gap-field);
	}
	.hint {
		font-size: var(--text-caption);
		color: var(--ink-3);
		margin: var(--space-4) 0 0;
	}
	.cap {
		font-size: var(--text-secondary);
		color: var(--ink-3);
		margin: 0;
	}
	footer {
		display: flex;
		align-items: flex-end;
		justify-content: space-between;
		gap: var(--gap-grid);
		flex-wrap: wrap;
		border-top: 1px solid var(--border);
		padding-top: var(--space-8);
	}
	.acts {
		display: flex;
		gap: var(--gap-inline);
		margin-left: auto;
	}
	.rail {
		display: flex;
		flex-direction: column;
		gap: var(--gap-grid);
		border-left: 1px solid var(--border);
		background: color-mix(in srgb, var(--surface-2) 55%, transparent);
		padding: var(--pad-card);
	}
	.facts {
		display: flex;
		flex-direction: column;
		gap: var(--space-7);
		margin: 0;
	}
	dt {
		font-size: var(--text-badge);
		text-transform: uppercase;
		letter-spacing: var(--ls-wide);
		color: var(--ink-3);
	}
	dd {
		margin: 0;
		font-size: var(--text-secondary);
		color: var(--ink);
	}
	dd.num {
		font-family: var(--font-display);
		font-size: var(--text-amount);
	}
	dd.good {
		color: var(--good-text);
	}
	/* Pinned to the foot of the rail: the one destructive control, as far from Save as the card allows. */
	.lifecycle {
		margin-top: auto;
		border-top: 1px solid var(--border);
		padding-top: var(--space-7);
	}
	.wide {
		width: 100%;
	}
	@media (max-width: 60rem) {
		.railed {
			grid-template-columns: minmax(0, 1fr);
		}
		.rail {
			border-left: 0;
			border-top: 1px solid var(--border);
		}
		.lifecycle {
			margin-top: 0;
		}
	}
</style>

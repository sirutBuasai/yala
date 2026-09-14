<script lang="ts">
	// Opening an account, asked as questions. Which questions there are comes from the kind's
	// capabilities, so nobody is shown a control that cannot apply to them.
	//
	// It never previews the name the account will get: the words go as typed and the API reports back
	// what it called the account, so the naming rule stays in one language.
	import {
		openAccount,
		type AccountExtras,
		type AccountNaming,
		type AccountTier
	} from '$lib/data/load';
	import type { AccountKind } from '$lib/data/types';
	import { SaveState } from '$lib/forms/saveState.svelte';
	import { problems, validateLabel, validateName, validateOptionalName } from '$lib/forms/validate';
	import { NOT_SET, NONE } from '$lib/copy';
	import Choice from '$lib/forms/Choice.svelte';
	import Guided, { type GuidedStep } from '$lib/forms/Guided.svelte';
	import Review, { type ReviewRow } from '$lib/forms/Review.svelte';
	import DatePicker from '$lib/forms/fields/DatePicker.svelte';
	import TextField from '$lib/forms/fields/TextField.svelte';
	import TextRows, { rowValues, type TextRow } from '$lib/forms/fields/TextRows.svelte';
	import {
		ADD,
		EMPLOYER,
		INSTITUTION,
		INSTITUTION_ALIAS,
		NAME,
		OPTIONS,
		TAX_TREATMENT
	} from '$lib/views/manage/copy';
	import {
		KIND_ORDER,
		TIERS,
		kindSingular,
		kindWhy,
		placeholder,
		productAliasLabel,
		productLabel,
		tierLabel
	} from '$lib/views/manage/kinds';

	interface Props {
		/** What each kind may carry, as the API describes it. */
		kinds: Record<string, AccountKind>;
		/** Active employers, offered where the kind may be scoped to one. */
		employers?: string[];
		/** Names already in use, per kind, so a duplicate is named here rather than surfacing as a
		    ledger error. */
		taken?: Record<string, string[]>;
		onclose: () => void;
		onsaved: () => void;
	}
	let { kinds, employers = [], taken = {}, onclose, onsaved }: Props = $props();

	const save = new SaveState();

	let at = $state(0);
	let kindName = $state('');
	let institutionName = $state('');
	let institutionAlias = $state('');
	let accountName = $state('');
	let accountAlias = $state('');
	let name = $state('');
	let tier = $state<AccountTier>('Taxable');
	let employer = $state('');
	let options = $state<TextRow[]>([]);
	let date = $state('');

	const kind = $derived<AccountKind | undefined>(kinds[kindName]);
	const offered = $derived(KIND_ORDER.filter((k) => kinds[k]));
	const product = $derived(productLabel(kindName));
	const labels = $derived(rowValues(options));

	/** Picking a kind is also the answer to "what next?", so it advances. */
	function pickKind(picked: string) {
		if (picked !== kindName) {
			// A kind decides which fields exist at all; keeping the old answers would carry a tier onto
			// something that has no tier.
			institutionName = institutionAlias = accountName = accountAlias = name = '';
			employer = '';
			tier = 'Taxable';
			options = [];
		}
		kindName = picked;
		at = 1;
	}

	function namingProblem(): string | null {
		return (
			problems()
				.add(validateName(institutionName, INSTITUTION))
				.add(validateOptionalName(institutionAlias, INSTITUTION_ALIAS))
				.message() || null
		);
	}

	function productProblem(): string | null {
		return (
			problems()
				.add(validateName(accountName, product))
				.add(validateOptionalName(accountAlias, productAliasLabel(kindName)))
				.message() || null
		);
	}

	function nameProblem(): string | null {
		const typed = name.trim();
		return (
			problems()
				.add(validateName(typed, NAME))
				.add((taken[kindName] ?? []).includes(typed) ? `${typed} already exists.` : null)
				.message() || null
		);
	}

	function optionsProblem(): string | null {
		const checks = problems();
		for (const label of labels) checks.add(validateLabel(label));
		checks.add(new Set(labels).size === labels.length ? null : OPTIONS.distinct);
		return checks.message() || null;
	}

	/** The questions this kind needs, in order. Everything after the first comes from its capabilities. */
	const steps = $derived.by<GuidedStep[]>(() => {
		const list: GuidedStep[] = [
			{
				key: 'kind',
				q: ADD.kind.q,
				sub: ADD.kind.sub,
				problem: () => (kindName ? null : ADD.kind.problem),
				uncounted: true,
				body: askKind
			}
		];
		if (!kind) return list;

		const asked = kind.name === 'card' ? 'card' : 'other';

		if (kind.named) {
			list.push({
				key: 'institution',
				q: ADD.institution.q[asked],
				sub: ADD.institution.sub,
				problem: namingProblem,
				body: askInstitution
			});
			if (kind.product) {
				list.push({
					key: 'product',
					q: ADD.product.q[asked],
					sub: ADD.product.sub[asked],
					problem: productProblem,
					body: askProduct
				});
			}
		} else {
			list.push({
				key: 'name',
				q: `What is the ${kindName} called?`,
				sub: `The name as it appears in the ${kindName} list.`,
				problem: nameProblem,
				body: askName
			});
		}

		if (kind.tiered) {
			list.push({ key: 'tier', q: ADD.tier.q, sub: ADD.tier.sub, body: askTier });
		}

		if (kind.scopable) {
			list.push({
				key: 'payroll',
				q: ADD.payroll.q,
				sub: ADD.payroll.sub,
				problem: kind.labelled ? optionsProblem : undefined,
				body: askPayroll
			});
		}

		return list;
	});

	const rows = $derived.by<ReviewRow[]>(() => {
		if (!kind) return [];
		/** A typed answer, reading as unanswered while it is blank. */
		const typed = (label: string, value: string, step: string): ReviewRow => ({
			label,
			value: value.trim() || NOT_SET,
			unset: !value.trim(),
			step
		});

		const list: ReviewRow[] = [{ label: 'Kind', value: kindSingular(kindName), step: 'kind' }];
		if (kind.named) {
			list.push(typed(INSTITUTION, institutionName, 'institution'));
			list.push(typed(INSTITUTION_ALIAS, institutionAlias, 'institution'));
			if (kind.product) {
				list.push(typed(product, accountName, 'product'));
				list.push(typed(productAliasLabel(kindName), accountAlias, 'product'));
			}
		} else {
			list.push(typed(NAME, name, 'name'));
		}
		if (kind.tiered) list.push({ label: TAX_TREATMENT, value: tierLabel(tier), step: 'tier' });
		if (kind.scopable) {
			list.push({
				label: EMPLOYER,
				value: employer || NONE,
				unset: !employer,
				step: 'payroll'
			});
		}
		if (kind.labelled) {
			list.push({
				label: 'Options',
				value: labels.length ? labels.join(', ') : NOT_SET,
				unset: !labels.length,
				step: 'payroll'
			});
		}
		// Asked here rather than as its own question: it is today unless you say otherwise, which is not
		// worth a whole screen.
		list.push({ label: 'Opened', body: askOpened });
		return list;
	});

	function naming(): AccountNaming {
		if (!kind?.named) return { name: name.trim() };
		const named: AccountNaming = {
			institution_name: institutionName.trim(),
			institution_alias: institutionAlias.trim()
		};
		if (kind.product) {
			named.account_name = accountName.trim();
			named.account_alias = accountAlias.trim();
		}
		return named;
	}

	function extras(): AccountExtras {
		const extra: AccountExtras = {};
		if (date) extra.date = date;
		if (kind?.tiered) extra.tier = tier;
		if (kind?.scopable) extra.employer = employer || null;
		if (kind?.labelled) extra.labels = labels;
		return extra;
	}

	/** Every step's check again, since a review can be reached and then edited back into a bad state. */
	function problem(): string | null {
		if (!kind) return ADD.kind.problem;
		if (kind.named) return namingProblem() ?? (kind.product ? productProblem() : null);
		return nameProblem() ?? (kind.labelled ? optionsProblem() : null);
	}

	async function submit() {
		if (!kind) return;
		const invalid = problem();
		if (invalid) return void save.fail(invalid);

		let opened = '';
		const ok = await save.run(async () => {
			const result = await openAccount(kind.name, naming(), extras());
			opened = result.name ?? '';
			return result.error;
		});

		if (ok) {
			save.note = `Added ${opened}.`;
			onsaved();
			onclose();
		}
	}
</script>

{#snippet askKind()}
	<div class="tiles">
		{#each offered as key (key)}
			<Choice
				tile
				label={kindSingular(key)}
				why={kindWhy(key)}
				selected={kindName === key}
				onpick={() => pickKind(key)}
			/>
		{/each}
	</div>
{/snippet}

{#snippet askInstitution()}
	<TextField
		lead
		label={INSTITUTION}
		bind:value={institutionName}
		placeholder={placeholder(kindName, 'institution')}
	/>
	<TextField
		label={INSTITUTION_ALIAS}
		bind:value={institutionAlias}
		placeholder={placeholder(kindName, 'institutionAlias')}
		optional
	/>
{/snippet}

{#snippet askProduct()}
	<TextField
		lead
		label={product}
		bind:value={accountName}
		placeholder={placeholder(kindName, 'product')}
	/>
	<TextField
		label={productAliasLabel(kindName)}
		bind:value={accountAlias}
		placeholder={placeholder(kindName, 'productAlias')}
		optional
	/>
{/snippet}

{#snippet askName()}
	<TextField
		lead
		label={NAME}
		ariaLabel={`New ${kindName} name`}
		bind:value={name}
		placeholder={placeholder(kindName, 'name')}
	/>
{/snippet}

{#snippet askTier()}
	<div class="stack">
		{#each TIERS as value (value)}
			<Choice
				label={tierLabel(value)}
				why={ADD.tier.why[value as AccountTier]}
				selected={tier === value}
				onpick={() => (tier = value as AccountTier)}
			/>
		{/each}
	</div>
{/snippet}

{#snippet askPayroll()}
	<div class="stack">
		<Choice
			label={kind?.labelled ? ADD.payroll.none.labelled : ADD.payroll.none.other}
			selected={!employer}
			onpick={() => (employer = '')}
		/>
		{#each employers as name (name)}
			<Choice label={name} selected={employer === name} onpick={() => (employer = name)} />
		{/each}
	</div>
	{#if kind?.labelled}
		<div class="options">
			<TextRows
				bind:rows={options}
				header={OPTIONS.header}
				optional
				addLabel={OPTIONS.add}
				noun={OPTIONS.noun}
				placeholder={OPTIONS.placeholder}
			/>
			<p class="hint">{OPTIONS.hint}</p>
		</div>
	{/if}
{/snippet}

{#snippet askOpened()}
	<DatePicker bind:value={date} ariaLabel="Open date for the new account" />
{/snippet}

<Guided
	kicker={ADD.kicker}
	title={kindName ? kindSingular(kindName) : ADD.untitled}
	{steps}
	{save}
	bind:at
	confirmLabel={ADD.confirm}
	onsubmit={submit}
	{onclose}
>
	{#snippet review(jump)}
		<Review {rows} {jump} />
	{/snippet}
</Guided>

<style>
	.tiles {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(13rem, 100%), 1fr));
		gap: var(--gap-row);
	}
	.stack {
		display: flex;
		flex-direction: column;
		gap: var(--gap-row);
	}
	.hint {
		font-size: var(--text-caption);
		color: var(--ink-3);
		margin: var(--space-5) 0 0;
	}
	.options {
		margin-top: var(--space-10);
	}
</style>

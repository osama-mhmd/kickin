<script lang="ts">
	import { cn } from '#lib/utils.ts';

	type Tone = 'strong' | 'good' | 'skip';

	type Match = {
		score: string;
		title: string;
		issue: string;
		labels: string[];
		time: string;
		note: string;
		tone: Tone;
	};

	let { class: className }: { class?: string } = $props();

	const matches: Match[] = [
		{
			score: '9.4',
			title: 'Fix focus trap in nested dialogs',
			issue: '#482',
			labels: ['bug', 'a11y'],
			time: '~2h',
			note: 'Strong fit — clear repro, small diff, and it sits right in your stack.',
			tone: 'strong'
		},
		{
			score: '8.1',
			title: 'Add keyboard support to the combobox',
			issue: '#517',
			labels: ['enhancement'],
			time: '~4h',
			note: 'Good fit — familiar patterns, just above your weekly time budget.',
			tone: 'good'
		},
		{
			score: '3.6',
			title: 'Rewrite the docs pipeline',
			issue: '#601',
			labels: ['docs', 'infra'],
			time: '~12h',
			note: 'Skip — outside your stack and far beyond the time you have this week.',
			tone: 'skip'
		}
	];

	const tones: Record<Tone, string> = {
		strong: 'border-emerald-400/20 bg-emerald-400/5 text-emerald-400',
		good: 'border-blue-400/20 bg-blue-400/5 text-blue-400',
		skip: 'border-white/10 bg-white/[0.02] text-zinc-500'
	};
</script>

<div class={cn('relative', className)}>
	<div class="absolute -inset-5 -z-10 rounded-[2rem] bg-primary/10 blur-3xl"></div>

	<div class="overflow-hidden rounded-2xl border border-white/10 bg-zinc-950/80 shadow-2xl">
		<div class="flex items-center justify-between border-b border-white/5 px-5 py-4">
			<div class="flex items-center gap-2.5">
				<span class="size-2 rounded-full bg-emerald-400"></span>
				<span class="text-sm font-medium text-zinc-100">Your matches</span>
			</div>
			<span class="text-[11px] text-zinc-500">sample output</span>
		</div>

		<div class="flex flex-wrap items-center gap-2 border-b border-white/5 px-5 py-3 text-xs">
			<span class="rounded-full border border-white/10 px-2 py-0.5 text-zinc-400">TypeScript</span>
			<span class="rounded-full border border-white/10 px-2 py-0.5 text-zinc-400">Svelte</span>
			<span class="rounded-full border border-white/10 px-2 py-0.5 text-zinc-400">4h / week</span>
			<span class="ml-auto text-zinc-500">12 issues analyzed</span>
		</div>

		<ul>
			{#each matches as match, index (match.title)}
				<li class="border-b border-white/5 px-5 py-4 last:border-b-0">
					<div class="flex items-start gap-4">
						<span
							class={cn(
								'mt-0.5 inline-flex size-10 shrink-0 items-center justify-center rounded-lg border text-sm font-semibold tabular-nums',
								tones[match.tone]
							)}
						>
							{match.score}
						</span>

						<div class="min-w-0 flex-1">
							<p class="truncate text-sm font-medium text-zinc-100">{match.title}</p>
							<div class="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-zinc-500">
								<span class="font-mono">{match.issue}</span>
								<span aria-hidden="true">·</span>
								{#each match.labels as label (label)}
									<span class="rounded-full border border-white/10 px-2 py-0.5">{label}</span>
								{/each}
								<span aria-hidden="true">·</span>
								<span>{match.time}</span>
							</div>
							<p class="mt-2 text-xs leading-relaxed text-zinc-500">{match.note}</p>
						</div>

						{#if index === 0}
							<span
								class="hidden shrink-0 rounded-full border border-emerald-400/20 bg-emerald-400/5 px-2 py-0.5 text-[11px] font-medium text-emerald-400 sm:inline-flex"
							>
								Pick this
							</span>
						{/if}
					</div>
				</li>
			{/each}
		</ul>

		<div
			class="flex items-center justify-between gap-4 border-t border-white/5 px-5 py-3 text-[11px] text-zinc-500"
		>
			<span>Every match ships with evidence and risks.</span>
			<span class="text-zinc-400">No optimism required</span>
		</div>
	</div>
</div>

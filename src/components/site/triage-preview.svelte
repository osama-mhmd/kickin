<script lang="ts">
	import { cn } from '#lib/utils.ts';

	type Bucket = {
		label: string;
		count: number;
		bar: string;
		dot: string;
		note: string;
	};

	let { class: className }: { class?: string } = $props();

	const total = 128;

	const buckets: Bucket[] = [
		{
			label: 'Remove',
			count: 12,
			bar: 'bg-rose-400/70',
			dot: 'bg-rose-400',
			note: 'Low context · not a bug · AI noise'
		},
		{
			label: 'Clarify',
			count: 34,
			bar: 'bg-amber-400/70',
			dot: 'bg-amber-400',
			note: 'Missing repro steps · unclear scope'
		},
		{
			label: 'Delegate',
			count: 82,
			bar: 'bg-emerald-400/70',
			dot: 'bg-emerald-400',
			note: 'Ready to pick up · labels suggested'
		}
	];
</script>

<div class={cn('relative', className)}>
	<div class="absolute -inset-5 -z-10 rounded-[2rem] bg-emerald-500/5 blur-3xl"></div>

	<div class="overflow-hidden rounded-2xl border border-white/10 bg-zinc-950/80 shadow-2xl">
		<div class="flex items-center justify-between border-b border-white/5 px-5 py-4">
			<span class="text-sm font-medium text-zinc-100">Issue triage</span>
			<span class="text-[11px] text-zinc-500">sample output</span>
		</div>

		<div class="px-5 py-5">
			<div class="flex items-end justify-between gap-4">
				<div>
					<p class="text-3xl font-semibold tracking-tight text-white tabular-nums">{total}</p>
					<p class="mt-0.5 text-xs text-zinc-500">open issues analyzed</p>
				</div>
				<p class="text-xs text-zinc-500">3 buckets</p>
			</div>

			<div class="mt-5 flex h-2 overflow-hidden rounded-full bg-white/5">
				{#each buckets as bucket (bucket.label)}
					<div
						class={cn('h-full', bucket.bar)}
						style="width: {Math.round((bucket.count / total) * 100)}%"
					></div>
				{/each}
			</div>

			<ul class="mt-5 divide-y divide-white/5">
				{#each buckets as bucket (bucket.label)}
					<li class="flex items-start gap-3 py-3.5 first:pt-0 last:pb-0">
						<span class={cn('mt-1.5 size-2 shrink-0 rounded-full', bucket.dot)}></span>
						<div class="min-w-0 flex-1">
							<div class="flex items-baseline justify-between gap-4">
								<p class="text-sm font-medium text-zinc-200">{bucket.label}</p>
								<span class="text-sm text-zinc-500 tabular-nums">{bucket.count}</span>
							</div>
							<p class="mt-0.5 text-xs text-zinc-500">{bucket.note}</p>
						</div>
					</li>
				{/each}
			</ul>
		</div>

		<div class="border-t border-white/5 px-5 py-3 text-[11px] text-zinc-500">
			Reasoning attached to every issue.
		</div>
	</div>
</div>

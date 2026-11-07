<script lang="ts">
	import { cn } from '#lib/utils.ts';

	type Props = {
		eyebrow: string;
		title: string;
		description?: string;
		align?: 'left' | 'center';
		class?: string;
	};

	let { eyebrow, title, description, align = 'left', class: className }: Props = $props();
</script>

<div class={cn('max-w-2xl', align === 'center' && 'mx-auto text-center', className)}>
	<p class="text-xs font-medium tracking-[0.2em] text-zinc-500 uppercase">{eyebrow}</p>
	<h2 class="mt-4 text-3xl font-semibold tracking-tight text-balance text-white sm:text-4xl">
		{title}
	</h2>
	{#if description}
		<p class="mt-4 text-base leading-relaxed text-pretty text-zinc-400">{description}</p>
	{/if}
</div>

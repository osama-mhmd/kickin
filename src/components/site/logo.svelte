<script lang="ts">
	import { resolve } from '$app/paths';
	import { cn } from '#lib/utils.ts';

	let { class: className }: { class?: string } = $props();
</script>

<a
	href={resolve('/')}
	aria-label="KickIn home"
	class={cn('group inline-flex items-center gap-2.5', className)}
>
	<span
		class="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm transition-transform group-hover:-rotate-3"
	>
		<svg viewBox="0 0 32 32" fill="none" aria-hidden="true" class="size-4">
			<path
				d="M9 8v16M9 16 21 8M9 16l12 8"
				stroke="currentColor"
				stroke-width="2.5"
				stroke-linecap="round"
				stroke-linejoin="round"
			/>
		</svg>
	</span>
	<span class="text-[17px] font-semibold tracking-tight text-zinc-100">KickIn</span>
</a>

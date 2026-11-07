<script lang="ts">
	import ArrowRightIcon from '@lucide/svelte/icons/arrow-right';
	import { Button, type ButtonSize, type ButtonVariant } from '$components/ui/button';
	import GithubIcon from '$components/site/github-icon.svelte';
	import { GITHUB_AUTH_URL } from '#lib/site.ts';
	import { cn } from '#lib/utils.ts';

	type Props = {
		href?: string;
		label?: string;
		variant?: ButtonVariant;
		size?: ButtonSize;
		class?: string;
		showArrow?: boolean;
	};

	let {
		href = GITHUB_AUTH_URL,
		label = 'Continue with GitHub',
		variant = 'default',
		size = 'lg',
		class: className,
		showArrow = false
	}: Props = $props();
</script>

<Button {href} {variant} {size} class={cn('group h-11 rounded-lg px-5 text-sm', className)}>
	<GithubIcon class="size-4" />
	<span>{label}</span>
	{#if showArrow}
		<ArrowRightIcon
			class="size-4 transition-transform duration-200 group-hover:translate-x-0.5"
			aria-hidden="true"
		/>
	{/if}
</Button>

<script lang="ts">
	import MenuIcon from '@lucide/svelte/icons/menu';
	import XIcon from '@lucide/svelte/icons/x';
	import { Button } from '$components/ui/button';
	import GitHubCta from '$components/site/github-cta.svelte';
	import GithubIcon from '$components/site/github-icon.svelte';
	import Logo from '$components/site/logo.svelte';
	import { GITHUB_REPO_URL } from '#lib/site.ts';
	import { cn } from '#lib/utils.ts';

	let { class: className }: { class?: string } = $props();

	let open = $state(false);

	const links = [
		{ href: '#how-it-works', label: 'How it works' },
		{ href: '#for-maintainers', label: 'For maintainers' },
		{ href: '#open-source', label: 'Open source' },
		{ href: '#faq', label: 'FAQ' }
	];
</script>

<svelte:window
	onkeydown={(event) => {
		if (event.key === 'Escape') open = false;
	}}
/>

<header
	class={cn(
		'sticky top-0 z-50 border-b border-white/5 bg-background/80 backdrop-blur-xl',
		className
	)}
>
	<div class="mx-auto flex h-16 max-w-6xl items-center justify-between gap-6 px-6">
		<Logo />

		<nav class="hidden items-center gap-7 md:flex" aria-label="Main navigation">
			{#each links as link (link.href)}
				<a
					href={link.href}
					class="group relative text-sm text-zinc-400 transition-colors hover:text-white"
				>
					{link.label}
					<span
						class="absolute -bottom-1.5 left-0 h-px w-0 bg-primary transition-all duration-200 group-hover:w-full"
					></span>
				</a>
			{/each}
		</nav>

		<div class="hidden items-center gap-1 md:flex">
			<Button
				href={GITHUB_REPO_URL}
				variant="ghost"
				size="sm"
				class="gap-2 text-zinc-400 hover:text-white"
				target="_blank"
				rel="noreferrer"
			>
				<GithubIcon class="size-4" />
				GitHub
			</Button>
			<GitHubCta size="sm" label="Sign in" class="ml-1 h-9 px-4" />
		</div>

		<button
			type="button"
			class="inline-flex size-9 items-center justify-center rounded-lg border border-white/10 text-zinc-300 transition-colors hover:bg-white/5 hover:text-white md:hidden"
			aria-label={open ? 'Close menu' : 'Open menu'}
			aria-expanded={open}
			aria-controls="mobile-navigation"
			onclick={() => (open = !open)}
		>
			{#if open}
				<XIcon class="size-5" aria-hidden="true" />
			{:else}
				<MenuIcon class="size-5" aria-hidden="true" />
			{/if}
		</button>
	</div>

	{#if open}
		<div id="mobile-navigation" class="border-t border-white/5 md:hidden">
			<nav class="mx-auto max-w-6xl px-6 py-4" aria-label="Mobile navigation">
				<ul class="flex flex-col">
					{#each links as link (link.href)}
						<li>
							<a
								href={link.href}
								class="block rounded-lg px-3 py-2.5 text-sm text-zinc-300 transition-colors hover:bg-white/5 hover:text-white"
								onclick={() => (open = false)}
							>
								{link.label}
							</a>
						</li>
					{/each}
				</ul>
				<div class="mt-4 flex flex-col gap-2 border-t border-white/5 pt-4">
					<Button
						href={GITHUB_REPO_URL}
						variant="outline"
						class="w-full justify-start gap-2"
						target="_blank"
						rel="noreferrer"
					>
						<GithubIcon class="size-4" />
						Star on GitHub
					</Button>
					<GitHubCta label="Continue with GitHub" class="w-full" />
				</div>
			</nav>
		</div>
	{/if}
</header>

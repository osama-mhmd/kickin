<script lang="ts">
	import ArrowUpIcon from '@lucide/svelte/icons/arrow-up';
	import ArrowUpRightIcon from '@lucide/svelte/icons/arrow-up-right';
	import GitHubCta from '$components/site/github-cta.svelte';
	import GithubIcon from '$components/site/github-icon.svelte';
	import Logo from '$components/site/logo.svelte';
	import { Button } from '$components/ui/button';
	import { DOCS_URL, GITHUB_REPO_URL } from '#lib/site.ts';
	import { cn } from '#lib/utils.ts';

	type FooterLink = { label: string; href: string; external?: boolean };
	type FooterColumn = { title: string; links: FooterLink[] };

	let { class: className }: { class?: string } = $props();

	const columns: FooterColumn[] = [
		{
			title: 'Product',
			links: [
				{ label: 'How it works', href: '#how-it-works' },
				{ label: 'For maintainers', href: '#for-maintainers' },
				{ label: 'FAQ', href: '#faq' }
			]
		},
		{
			title: 'Resources',
			links: [
				{ label: 'Documentation', href: DOCS_URL, external: true },
				{ label: 'Architecture', href: `${DOCS_URL}/architecture.md`, external: true },
				{ label: 'AI analysis', href: `${DOCS_URL}/ai-analysis.md`, external: true }
			]
		},
		{
			title: 'Project',
			links: [
				{ label: 'Source code', href: GITHUB_REPO_URL, external: true },
				{
					label: 'Contributing',
					href: `${GITHUB_REPO_URL}/blob/main/README.md#contributing`,
					external: true
				},
				{ label: 'Open issues', href: `${GITHUB_REPO_URL}/issues`, external: true }
			]
		}
	];

	const year = new Date().getFullYear();
</script>

<footer class={cn('border-t border-white/5', className)}>
	<div class="mx-auto max-w-6xl px-6">
		<div
			class="grid gap-14 border-b border-white/5 py-24 md:py-32 lg:grid-cols-[1.2fr_1fr] lg:items-end"
		>
			<div>
				<p class="text-xs font-medium tracking-[0.2em] text-zinc-500 uppercase">
					Ready when you are
				</p>
				<h2
					class="mt-5 max-w-xl text-4xl font-semibold tracking-tight text-balance text-white sm:text-5xl"
				>
					Your next contribution is already in the backlog.
				</h2>
				<p class="mt-5 max-w-lg text-base leading-relaxed text-pretty text-zinc-400">
					Sign in with GitHub, tell KickIn how you work, and let it find the issue worth your
					afternoon.
				</p>
				<div class="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
					<GitHubCta size="lg" class="h-11 px-5" />
					<span class="text-xs text-zinc-500">Free forever. No credit card. No setup.</span>
				</div>
			</div>

			<a
				href={GITHUB_REPO_URL}
				target="_blank"
				rel="external noreferrer"
				class="group flex items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.02] p-5 transition-colors hover:border-white/20 hover:bg-white/[0.04] lg:justify-self-end"
			>
				<span
					class="flex size-11 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-zinc-900 text-zinc-300"
				>
					<GithubIcon class="size-5" />
				</span>
				<span class="min-w-0">
					<span class="block text-sm font-medium text-zinc-200">KickIn is open source</span>
					<span class="mt-0.5 block truncate font-mono text-xs text-zinc-500">
						github.com/osama-mhmd/kickin
					</span>
				</span>
				<ArrowUpRightIcon
					class="ml-2 size-4 shrink-0 text-zinc-500 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
					aria-hidden="true"
				/>
			</a>
		</div>

		<div class="grid gap-12 py-16 md:grid-cols-[1.5fr_1fr_1fr_1fr] md:py-20">
			<div class="max-w-sm">
				<Logo />
				<p class="mt-5 text-sm leading-relaxed text-zinc-500">
					Issue matching and triage for people who would rather ship than scroll.
				</p>
				<a
					href={GITHUB_REPO_URL}
					target="_blank"
					rel="external noreferrer"
					class="mt-6 inline-flex items-center gap-2 text-sm text-zinc-400 transition-colors hover:text-white"
				>
					<GithubIcon class="size-4" />
					Star on GitHub
				</a>
			</div>

			{#each columns as column (column.title)}
				<div>
					<h3 class="text-xs font-medium tracking-[0.16em] text-zinc-500 uppercase">
						{column.title}
					</h3>
					<ul class="mt-5 space-y-3">
						{#each column.links as link (link.label)}
							<li>
								<!-- eslint-disable svelte/no-navigation-without-resolve -->
								<a
									href={link.href}
									target={link.external ? '_blank' : undefined}
									rel={link.external ? 'noreferrer' : undefined}
									class="text-sm text-zinc-400 transition-colors hover:text-white"
								>
									{link.label}
								</a>
								<!-- eslint-enable svelte/no-navigation-without-resolve -->
							</li>
						{/each}
					</ul>
				</div>
			{/each}
		</div>

		<div
			class="flex flex-col gap-4 border-t border-white/5 py-8 text-xs text-zinc-500 sm:flex-row sm:items-center sm:justify-between"
		>
			<p>© {year} KickIn. Free and open source.</p>
			<div class="flex flex-wrap items-center gap-x-6 gap-y-2">
				<span>
					Built by
					<Button variant="link" class="px-1 text-xs"
						><a href="https://osama-mhmd.vercel.app">Osama Mohammed</a></Button
					></span
				>
				<a
					href="#top"
					class="inline-flex items-center gap-1.5 transition-colors hover:text-zinc-300"
				>
					Back to top
					<ArrowUpIcon class="size-3.5" aria-hidden="true" />
				</a>
			</div>
		</div>
	</div>
</footer>

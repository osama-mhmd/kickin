<script lang="ts">
	import ArrowDownIcon from '@lucide/svelte/icons/arrow-down';
	import ArrowUpRightIcon from '@lucide/svelte/icons/arrow-up-right';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import Footer from '$components/site/footer.svelte';
	import GitHubCta from '$components/site/github-cta.svelte';
	import GithubIcon from '$components/site/github-icon.svelte';
	import MatchPreview from '$components/site/match-preview.svelte';
	import Navbar from '$components/site/navbar.svelte';
	import SectionHeading from '$components/site/section-heading.svelte';
	import TriagePreview from '$components/site/triage-preview.svelte';
	import { Badge } from '$components/ui/badge';
	import { Button } from '$components/ui/button';
	import { DOCS_URL, GITHUB_REPO_URL } from '#lib/site.ts';
	import { cn } from '#lib/utils.ts';

	const principles = [
		{
			title: 'Honest by default',
			description:
				'Scores are clamped when evidence is thin. Every match lists its risks, not just reasons to say yes.'
		},
		{
			title: 'Fast by design',
			description:
				'Each repository is mapped once and reused, so you are never waiting on the same work twice.'
		},
		{
			title: 'Open source',
			description:
				'Prompts, pipelines and scoring rules are all public. You can audit exactly how a match was made.'
		}
	];

	const steps = [
		{
			title: 'Sign in with GitHub',
			description:
				'One click. No forms, no passwords, no credit card. Your profile starts with the stack you already use.'
		},
		{
			title: 'Pick a repository',
			description:
				'Drop in owner/name. KickIn maps the codebase once and caches it, so the next person does not pay for it.'
		},
		{
			title: 'Get your shortlist',
			description:
				'Every issue gets a fit score, the evidence behind it, and the risks you should weigh before you start.'
		}
	];

	const maintainerBullets = [
		{
			title: 'Remove',
			description: 'too little context, not a real bug, or low-effort noise.',
			dot: 'bg-rose-400'
		},
		{
			title: 'Clarify',
			description: 'plausible, but missing reproduction steps, versions, or scope.',
			dot: 'bg-amber-400'
		},
		{
			title: 'Delegate',
			description: 'clear and actionable, with suggested labels for the next contributor.',
			dot: 'bg-emerald-400'
		}
	];

	const technologies = ['SvelteKit', 'TypeScript', 'Drizzle', 'PostgreSQL', 'BullMQ'];

	const faqs = [
		{
			question: 'Is KickIn really free?',
			answer:
				'Yes. No trial, no credit card, no paid tier hiding the useful parts. KickIn is open source, too.'
		},
		{
			question: 'Why GitHub only?',
			answer:
				'GitHub is where the issues are. One identity keeps matching accurate and sign-in to a single click.'
		},
		{
			question: 'How does the matching work?',
			answer:
				'KickIn builds a map of a repository once, then analyzes each open issue against your languages, stack, strengths and available time. Every result includes evidence and risks so you can make the final call.'
		},
		{
			question: 'Does KickIn read private repositories?',
			answer:
				'No. It works with public repositories and public issues. The source is downloaded as a tarball only to build the code map.'
		},
		{
			question: 'I maintain a project. Can I use it?',
			answer:
				'Yes. The same analysis sorts your backlog into Remove, Clarify and Delegate, with suggested labels and questions to send back to the reporter.'
		}
	];
</script>

<svelte:head>
	<title>KickIn — Stop scrolling through issues</title>
	<meta property="og:title" content="KickIn — Stop scrolling through issues" />
	<meta
		property="og:description"
		content="Find open-source issues that actually fit you. Honest scores, real reasons, no credit card."
	/>
	<meta property="og:type" content="website" />
	<meta name="twitter:card" content="summary_large_image" />
</svelte:head>

<a
	href="#main"
	class="sr-only rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-[100]"
>
	Skip to content
</a>

<div id="top" class="min-h-screen overflow-x-clip bg-background text-foreground">
	<Navbar />

	<main id="main">
		<section class="relative isolate overflow-hidden">
			<div
				aria-hidden="true"
				class="bg-grid pointer-events-none absolute inset-0 -z-10 [mask-image:linear-gradient(to_bottom,black,transparent_85%)]"
			></div>
			<div
				aria-hidden="true"
				class="pointer-events-none absolute top-[-22rem] left-1/2 -z-10 h-[36rem] w-[54rem] -translate-x-1/2 rounded-full bg-primary/10 blur-[120px]"
			></div>

			<div
				class="mx-auto grid max-w-6xl gap-16 px-6 pt-20 pb-24 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:gap-12 lg:pt-28 lg:pb-32"
			>
				<div>
					<Badge
						variant="outline"
						class="gap-2 border-white/10 bg-white/[0.03] px-3 py-1 text-zinc-300"
					>
						<span class="size-1.5 rounded-full bg-primary"></span>
						Open source · Free forever
					</Badge>

					<h1
						class="mt-6 max-w-3xl text-5xl font-semibold tracking-[-0.04em] text-balance text-white sm:text-6xl lg:text-7xl"
					>
						Stop scrolling through issues.
						<span class="block">
							Kick in on the <span class="text-primary">right one</span>.
						</span>
					</h1>

					<p class="mt-6 max-w-xl text-lg leading-relaxed text-pretty text-zinc-400">
						KickIn reads a repository's open issues, matches them to your stack, strengths and the
						time you actually have, and hands you the few worth your attention. Honest scores. Real
						reasons. No busywork.
					</p>

					<div class="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
						<GitHubCta size="lg" class="h-11 px-5" />
						<Button
							href="#how-it-works"
							variant="ghost"
							size="lg"
							class="h-11 justify-start px-5 text-zinc-300 hover:text-white"
						>
							See how it works
							<ArrowDownIcon class="size-4" aria-hidden="true" />
						</Button>
					</div>

					<p class="mt-5 text-xs text-zinc-500">No credit card. No setup. GitHub sign-in only.</p>
				</div>

				<MatchPreview class="lg:ml-auto lg:w-full lg:max-w-md" />
			</div>
		</section>

		<section class="mx-auto max-w-6xl px-6">
			<div class="grid gap-8 border-y border-white/5 py-10 sm:grid-cols-3">
				{#each principles as principle (principle.title)}
					<div class="flex gap-3">
						<span class="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary"></span>
						<div>
							<p class="text-sm font-medium text-zinc-200">{principle.title}</p>
							<p class="mt-1.5 text-sm leading-relaxed text-zinc-500">
								{principle.description}
							</p>
						</div>
					</div>
				{/each}
			</div>
		</section>

		<section id="how-it-works" class="mx-auto max-w-6xl scroll-mt-24 px-6 py-24 md:py-32">
			<SectionHeading
				eyebrow="How it works"
				title="From issue overload to one clear next step."
				description="No dashboards to learn. No forty-tab research session. Pick a repository and get a short list you can trust."
			/>

			<div
				class="mt-14 grid gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/10 md:grid-cols-3"
			>
				{#each steps as step, index (step.title)}
					<div class="bg-zinc-950 p-8 transition-colors duration-200 hover:bg-zinc-900/60">
						<span class="font-mono text-xs text-primary">0{index + 1}</span>
						<h3 class="mt-8 text-lg font-medium text-white">{step.title}</h3>
						<p class="mt-3 text-sm leading-relaxed text-zinc-400">{step.description}</p>
					</div>
				{/each}
			</div>
		</section>

		<section id="for-maintainers" class="scroll-mt-24 border-y border-white/5 bg-white/[0.015]">
			<div class="mx-auto max-w-6xl px-6 py-24 md:py-32">
				<div class="grid gap-14 lg:grid-cols-2 lg:items-center lg:gap-20">
					<div>
						<SectionHeading
							eyebrow="For maintainers"
							title="Your backlog, sorted before you open it."
							description="KickIn triages every issue into Remove, Clarify, or Delegate, with the reasoning attached. Close the noise, ask better questions, and hand off work that is actually ready."
						/>

						<ul class="mt-8 space-y-5">
							{#each maintainerBullets as bullet (bullet.title)}
								<li class="flex gap-3">
									<span class={cn('mt-1.5 size-2 shrink-0 rounded-full', bullet.dot)}></span>
									<p class="text-sm leading-relaxed text-zinc-400">
										<span class="font-medium text-zinc-200">{bullet.title}</span>
										— {bullet.description}
									</p>
								</li>
							{/each}
						</ul>

						<a
							href={`${DOCS_URL}/ai-analysis.md`}
							target="_blank"
							rel="external noreferrer"
							class="mt-8 inline-flex items-center gap-1.5 text-sm font-medium text-zinc-300 transition-colors hover:text-white"
						>
							Read the triage contract
							<ArrowUpRightIcon class="size-4" aria-hidden="true" />
						</a>
					</div>

					<TriagePreview class="lg:ml-auto lg:w-full lg:max-w-md" />
				</div>
			</div>
		</section>

		<section id="open-source" class="mx-auto max-w-6xl scroll-mt-24 px-6 py-24 md:py-32">
			<div
				class="relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02] p-8 md:p-12"
			>
				<div
					aria-hidden="true"
					class="pointer-events-none absolute top-0 right-0 h-64 w-64 rounded-full bg-primary/10 blur-3xl"
				></div>

				<div class="relative grid gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
					<div>
						<p class="text-xs font-medium tracking-[0.2em] text-zinc-500 uppercase">Open source</p>
						<h2
							class="mt-4 text-3xl font-semibold tracking-tight text-balance text-white sm:text-4xl"
						>
							Built in the open. Because of course it is.
						</h2>
						<p class="mt-4 max-w-lg text-base leading-relaxed text-pretty text-zinc-400">
							KickIn is free, open source, and shaped by the people who use it. Read the prompts,
							audit the scoring, open an issue, or send the fix yourself.
						</p>

						<div class="mt-6 flex flex-wrap gap-2">
							{#each technologies as technology (technology)}
								<Badge variant="outline" class="border-white/10 bg-white/[0.02] text-zinc-400">
									{technology}
								</Badge>
							{/each}
						</div>
					</div>

					<div class="rounded-xl border border-white/10 bg-zinc-950/60 p-5">
						<div class="flex items-center gap-3">
							<span
								class="flex size-10 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-zinc-900 text-zinc-300"
							>
								<GithubIcon class="size-5" />
							</span>
							<div class="min-w-0">
								<p class="truncate font-mono text-sm text-zinc-200">osama-mhmd/kickin</p>
								<p class="mt-0.5 text-xs text-zinc-500">Contributions welcome</p>
							</div>
						</div>

						<p class="mt-4 text-sm leading-relaxed text-zinc-500">
							The whole thing: app, workers, prompts, and the scoring rules.
						</p>

						<Button
							href={GITHUB_REPO_URL}
							variant="outline"
							class="mt-5 w-full justify-between gap-2"
							target="_blank"
							rel="noreferrer"
						>
							View the repository
							<ArrowUpRightIcon class="size-4" aria-hidden="true" />
						</Button>
					</div>
				</div>
			</div>
		</section>

		<section id="faq" class="mx-auto max-w-6xl scroll-mt-24 px-6 pb-24 md:pb-32">
			<div class="grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
				<SectionHeading
					eyebrow="FAQ"
					title="A few honest answers."
					description="If something is still unclear, open an issue. The repo is the product."
				/>

				<div class="divide-y divide-white/5 border-y border-white/5">
					{#each faqs as faq (faq.question)}
						<details class="group py-5">
							<summary
								class="flex cursor-pointer list-none items-start justify-between gap-6 text-left text-base font-medium text-zinc-100 [&::-webkit-details-marker]:hidden"
							>
								{faq.question}
								<PlusIcon
									class="mt-0.5 size-4 shrink-0 text-zinc-500 transition-transform duration-200 group-open:rotate-45"
									aria-hidden="true"
								/>
							</summary>
							<p class="mt-3 max-w-xl text-sm leading-relaxed text-zinc-400">{faq.answer}</p>
						</details>
					{/each}
				</div>
			</div>
		</section>
	</main>

	<Footer />
</div>

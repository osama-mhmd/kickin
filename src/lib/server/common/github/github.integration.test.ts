import { mkdtemp, open, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, onTestFinished, test } from 'vitest';
import { getGitHubModule } from './index';

const TEST_REPO = 'osama-mhmd/kickin';
const ISSUES_TEST_REPO = 'sveltejs/svelte';

test(
	'integration: fetches the real project repository',
	{ retry: 2, timeout: 60_000 },
	async () => {
		const repo = await getGitHubModule().repositories.get(TEST_REPO);

		expect(repo.full_name).toBe(TEST_REPO);
		expect(repo.private).toBe(false);
		expect(repo.default_branch.length).toBeGreaterThan(0);
		expect(Number.isInteger(repo.stargazers_count)).toBe(true);
		expect(repo.stargazers_count).toBeGreaterThanOrEqual(0);
	}
);

test('integration: returns the real star count', { retry: 2, timeout: 60_000 }, async () => {
	const github = getGitHubModule();
	const [repo, stars] = await Promise.all([
		github.repositories.get(TEST_REPO),
		github.repositories.getStars(TEST_REPO)
	]);

	expect(stars).toBe(repo.stargazers_count);
});

test(
	'integration: lists real issues with limit and offset',
	{ retry: 2, timeout: 60_000 },
	async () => {
		const github = getGitHubModule();
		const firstPage = await github.issues.list(ISSUES_TEST_REPO, {
			limit: 2,
			offset: 0,
			state: 'all'
		});
		const secondPage = await github.issues.list(ISSUES_TEST_REPO, {
			limit: 2,
			offset: 2,
			state: 'all'
		});

		expect(firstPage).toHaveLength(2);
		expect(secondPage).toHaveLength(2);
		expect(firstPage[0]?.number).not.toBe(secondPage[0]?.number);

		for (const issue of [...firstPage, ...secondPage]) {
			expect(typeof issue.number).toBe('number');
			expect(typeof issue.title).toBe('string');
			expect(issue.html_url.startsWith('https://github.com/')).toBe(true);
			expect(issue.pull_request).toBeUndefined();
		}
	}
);

test('integration: streams the real project tarball', { retry: 2, timeout: 60_000 }, async () => {
	const github = getGitHubModule();
	const repo = await github.repositories.get(TEST_REPO);
	const tarball = await github.tarballs.fetch(TEST_REPO, { ref: repo.default_branch });
	const reader = tarball.stream.getReader();
	const { value } = await reader.read();

	await reader.cancel();

	expect(value).toBeDefined();
	expect(value?.[0]).toBe(0x1f);
	expect(value?.[1]).toBe(0x8b);
});

test('integration: downloads the real project tarball', { retry: 2, timeout: 60_000 }, async () => {
	const directory = await mkdtemp(join(tmpdir(), 'kickin-integration-'));
	onTestFinished(async () => rm(directory, { recursive: true, force: true }));

	const github = getGitHubModule();
	const repo = await github.repositories.get(TEST_REPO);
	const downloaded = await github.tarballs.download(TEST_REPO, `${directory}/`, {
		ref: repo.default_branch,
		filename: 'kickin.tar.gz'
	});
	const info = await stat(downloaded.path);
	const handle = await open(downloaded.path, 'r');
	const buffer = Buffer.alloc(2);
	const { bytesRead } = await handle.read(buffer, 0, 2, 0);

	await handle.close();

	expect(downloaded.filename).toBe('kickin.tar.gz');
	expect(downloaded.bytes).toBeGreaterThan(0);
	expect(info.size).toBe(downloaded.bytes);
	expect(bytesRead).toBe(2);
	expect(buffer[0]).toBe(0x1f);
	expect(buffer[1]).toBe(0x8b);
});

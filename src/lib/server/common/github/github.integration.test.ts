import assert from 'node:assert/strict';
import { mkdtemp, open, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { getGitHubModule } from './index';

const TEST_REPO = 'osama-mhmd/kickin';
const ISSUES_TEST_REPO = 'sveltejs/svelte';

test('integration: fetches the real project repository', async () => {
	const repo = await getGitHubModule().repositories.get(TEST_REPO);

	assert.equal(repo.full_name, TEST_REPO);
	assert.equal(repo.private, false);
	assert.ok(repo.default_branch.length > 0);
	assert.ok(Number.isInteger(repo.stargazers_count));
	assert.ok(repo.stargazers_count >= 0);
});

test('integration: returns the real star count', async () => {
	const github = getGitHubModule();
	const [repo, stars] = await Promise.all([
		github.repositories.get(TEST_REPO),
		github.repositories.getStars(TEST_REPO)
	]);

	assert.equal(stars, repo.stargazers_count);
});

test('integration: lists real issues with limit and offset', async () => {
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

	assert.equal(firstPage.length, 2);
	assert.equal(secondPage.length, 2);
	assert.notEqual(firstPage[0]?.number, secondPage[0]?.number);

	for (const issue of [...firstPage, ...secondPage]) {
		assert.equal(typeof issue.number, 'number');
		assert.equal(typeof issue.title, 'string');
		assert.ok(issue.html_url.startsWith('https://github.com/'));
		assert.equal(issue.pull_request, undefined);
	}
});

test('integration: streams the real project tarball', async () => {
	const github = getGitHubModule();
	const repo = await github.repositories.get(TEST_REPO);
	const tarball = await github.tarballs.fetch(TEST_REPO, { ref: repo.default_branch });
	const reader = tarball.stream.getReader();
	const { value } = await reader.read();

	await reader.cancel();

	assert.ok(value);
	assert.equal(value[0], 0x1f);
	assert.equal(value[1], 0x8b);
});

test('integration: downloads the real project tarball', async (t) => {
	const directory = await mkdtemp(join(tmpdir(), 'kickin-integration-'));
	t.after(async () => rm(directory, { recursive: true, force: true }));

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

	assert.equal(downloaded.filename, 'kickin.tar.gz');
	assert.ok(downloaded.bytes > 0);
	assert.equal(info.size, downloaded.bytes);
	assert.equal(bytesRead, 2);
	assert.equal(buffer[0], 0x1f);
	assert.equal(buffer[1], 0x8b);
});

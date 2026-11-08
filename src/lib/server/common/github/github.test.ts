import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
	createGitHubModule,
	GitHubApiError,
	GitHubConfigurationError,
	GitHubRateLimitError,
	GitHubValidationError,
	normalizeRepositoryRef
} from './index';
import type { GitHubFetch, GitHubIssue, GitHubRepository } from './types';

interface RecordedRequest {
	url: URL;
	init: RequestInit;
}

function jsonResponse(
	data: unknown,
	options: { status?: number; headers?: Record<string, string> } = {}
): Response {
	return new Response(JSON.stringify(data), {
		status: options.status ?? 200,
		headers: { 'content-type': 'application/json', ...options.headers }
	});
}

function repository(overrides: Partial<GitHubRepository> = {}): GitHubRepository {
	return {
		id: 1,
		name: 'repo',
		full_name: 'owner/repo',
		private: false,
		owner: { login: 'owner', id: 2 },
		html_url: 'https://github.com/owner/repo',
		description: null,
		default_branch: 'main',
		stargazers_count: 42,
		forks_count: 3,
		open_issues_count: 4,
		language: 'TypeScript',
		archived: false,
		disabled: false,
		size: 128,
		pushed_at: null,
		updated_at: '2026-01-01T00:00:00Z',
		created_at: '2025-01-01T00:00:00Z',
		...overrides
	};
}

function issue(number: number, overrides: Partial<GitHubIssue> = {}): GitHubIssue {
	return {
		id: number,
		number,
		title: `Issue ${number}`,
		body: null,
		state: 'open',
		labels: [],
		user: null,
		assignee: null,
		comments: 0,
		created_at: '2026-01-01T00:00:00Z',
		updated_at: '2026-01-01T00:00:00Z',
		closed_at: null,
		html_url: `https://github.com/owner/repo/issues/${number}`,
		...overrides
	};
}

test('getRepository sends the configured auth headers', async () => {
	const requests: RecordedRequest[] = [];
	const fetch: GitHubFetch = async (input, init) => {
		requests.push({ url: new URL(input), init: init ?? {} });

		return jsonResponse(repository());
	};
	const github = createGitHubModule({ token: 'secret-token', fetch });

	const repo = await github.repositories.get('owner/repo');
	const headers = new Headers(requests[0].init.headers);

	assert.equal(repo.stargazers_count, 42);
	assert.equal(requests[0].url.href, 'https://api.github.com/repos/owner/repo');
	assert.equal(headers.get('authorization'), 'Bearer secret-token');
	assert.equal(headers.get('x-github-api-version'), '2022-11-28');
	assert.equal(headers.get('user-agent'), 'kickin');
	assert.equal(headers.get('accept'), 'application/vnd.github+json');
});

test('getRepositoryStars returns the stargazer count', async () => {
	const fetch: GitHubFetch = async () => jsonResponse(repository({ stargazers_count: 7 }));
	const github = createGitHubModule({ token: 'token', fetch });

	assert.equal(await github.repositories.getStars('owner/repo'), 7);
});

test('listIssues applies offset and filters pull requests by default', async () => {
	const requests: RecordedRequest[] = [];
	const items = [
		issue(1),
		issue(2, { pull_request: { url: 'https://api.github.com/pulls/2' } }),
		issue(3),
		issue(4),
		issue(5)
	];
	const fetch: GitHubFetch = async (input, init) => {
		requests.push({ url: new URL(input), init: init ?? {} });

		return jsonResponse(items);
	};
	const github = createGitHubModule({ token: 'token', fetch });

	const issues = await github.issues.list('owner/repo', { limit: 2, offset: 1 });

	assert.deepEqual(
		issues.map((item) => item.number),
		[3, 4]
	);
	assert.equal(requests[0].url.searchParams.get('per_page'), '100');
	assert.equal(requests[0].url.searchParams.get('state'), 'open');
});

test('listIssues paginates when offset and limit cross a page boundary', async () => {
	const items = Array.from({ length: 103 }, (_, index) => issue(index + 1));
	const pages: number[] = [];
	const fetch: GitHubFetch = async (input) => {
		const url = new URL(input);
		const page = Number(url.searchParams.get('page'));
		pages.push(page);

		return jsonResponse(items.slice((page - 1) * 100, page * 100), {
			headers:
				page === 1
					? {
							link: '<https://api.github.com/repos/owner/repo/issues?page=2>; rel="next"'
						}
					: {}
		});
	};
	const github = createGitHubModule({ token: 'token', fetch });

	const issues = await github.issues.list('owner/repo', {
		limit: 2,
		offset: 99,
		includePullRequests: true
	});

	assert.deepEqual(
		issues.map((item) => item.number),
		[100, 101]
	);
	assert.deepEqual(pages, [1, 2]);
});

test('listIssues supports label filtering and issue state', async () => {
	const requests: RecordedRequest[] = [];
	const fetch: GitHubFetch = async (input, init) => {
		requests.push({ url: new URL(input), init: init ?? {} });

		return jsonResponse([]);
	};
	const github = createGitHubModule({ token: 'token', fetch });

	await github.issues.list('owner/repo', {
		state: 'all',
		labels: ['good first issue', 'help wanted'],
		sort: 'updated',
		direction: 'asc'
	});

	const url = requests[0].url;

	assert.equal(url.searchParams.get('state'), 'all');
	assert.equal(url.searchParams.get('labels'), 'good first issue,help wanted');
	assert.equal(url.searchParams.get('sort'), 'updated');
	assert.equal(url.searchParams.get('direction'), 'asc');
});

test('GitHub API errors are typed and expose rate limit details', async () => {
	const fetch: GitHubFetch = async () =>
		jsonResponse(
			{ message: 'API rate limit exceeded' },
			{
				status: 403,
				headers: {
					'x-ratelimit-remaining': '0',
					'x-ratelimit-limit': '60',
					'x-ratelimit-reset': '1700000000'
				}
			}
		);
	const github = createGitHubModule({ token: 'token', fetch });

	await assert.rejects(github.repositories.get('owner/repo'), (error: unknown) => {
		assert.ok(error instanceof GitHubRateLimitError);
		assert.equal(error.status, 403);
		assert.equal(error.remaining, 0);
		assert.equal(error.limit, 60);
		assert.equal(error.resetAt?.getTime(), 1_700_000_000_000);

		return true;
	});
});

test('not found responses use the not_found error code', async () => {
	const fetch: GitHubFetch = async () => jsonResponse({ message: 'Not Found' }, { status: 404 });
	const github = createGitHubModule({ token: 'token', fetch });

	await assert.rejects(github.repositories.get('owner/repo'), (error: unknown) => {
		assert.ok(error instanceof GitHubApiError);
		assert.equal(error.code, 'not_found');
		assert.equal(error.isNotFound, true);

		return true;
	});
});

test('a missing token fails fast with a configuration error', () => {
	assert.throws(() => createGitHubModule({ token: '' }), GitHubConfigurationError);
});

test('repository references are validated', () => {
	assert.deepEqual(normalizeRepositoryRef('owner/repo'), { owner: 'owner', name: 'repo' });
	assert.deepEqual(normalizeRepositoryRef({ owner: 'owner', name: 'repo' }), {
		owner: 'owner',
		name: 'repo'
	});
	assert.throws(() => normalizeRepositoryRef('owner'), GitHubValidationError);
	assert.throws(() => normalizeRepositoryRef('owner/repo/extra'), GitHubValidationError);
});

test('fetchRepositoryTarball exposes the response stream and filename', async () => {
	const requests: RecordedRequest[] = [];
	const fetch: GitHubFetch = async (input, init) => {
		requests.push({ url: new URL(input), init: init ?? {} });

		return new Response(new Uint8Array([1, 2, 3]), {
			status: 200,
			headers: {
				'content-type': 'application/gzip',
				'content-disposition': 'attachment; filename=owner-repo-abc.tar.gz'
			}
		});
	};
	const github = createGitHubModule({ token: 'token', fetch });

	const tarball = await github.tarballs.fetch('owner/repo', { ref: 'feature/x' });
	const bytes = new Uint8Array(await new Response(tarball.stream).arrayBuffer());

	assert.equal(requests[0].url.pathname, '/repos/owner/repo/tarball/feature%2Fx');
	assert.equal(tarball.filename, 'owner-repo-abc.tar.gz');
	assert.equal(tarball.contentType, 'application/gzip');
	assert.deepEqual([...bytes], [1, 2, 3]);
});

test('downloadRepositoryTarball writes the stream to disk', async (t) => {
	const directory = await mkdtemp(join(tmpdir(), 'kickin-github-'));
	t.after(async () => rm(directory, { recursive: true, force: true }));

	const fetch: GitHubFetch = async () =>
		new Response(new Uint8Array([4, 5, 6]), {
			status: 200,
			headers: { 'content-type': 'application/gzip' }
		});
	const github = createGitHubModule({ token: 'token', fetch });

	const downloaded = await github.tarballs.download('owner/repo', `${directory}/`, {
		filename: 'snapshot.tar.gz'
	});
	const file = await readFile(downloaded.path);
	const fileInfo = await stat(downloaded.path);

	assert.equal(downloaded.bytes, 3);
	assert.equal(downloaded.filename, 'snapshot.tar.gz');
	assert.equal(fileInfo.size, 3);
	assert.deepEqual([...file], [4, 5, 6]);
});

test('downloadRepositoryTarball refuses to overwrite when asked', async (t) => {
	const directory = await mkdtemp(join(tmpdir(), 'kickin-github-'));
	t.after(async () => rm(directory, { recursive: true, force: true }));

	const fetch: GitHubFetch = async () => new Response(new Uint8Array([7]), { status: 200 });
	const github = createGitHubModule({ token: 'token', fetch });
	const destination = join(directory, 'snapshot.tar.gz');

	await github.tarballs.download('owner/repo', destination);

	await assert.rejects(
		github.tarballs.download('owner/repo', destination, { overwrite: false }),
		GitHubValidationError
	);
});

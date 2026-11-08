import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, onTestFinished, test } from 'vitest';
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

	expect(repo.stargazers_count).toBe(42);
	expect(requests[0].url.href).toBe('https://api.github.com/repos/owner/repo');
	expect(headers.get('authorization')).toBe('Bearer secret-token');
	expect(headers.get('x-github-api-version')).toBe('2022-11-28');
	expect(headers.get('user-agent')).toBe('kickin');
	expect(headers.get('accept')).toBe('application/vnd.github+json');
});

test('getRepositoryStars returns the stargazer count', async () => {
	const fetch: GitHubFetch = async () => jsonResponse(repository({ stargazers_count: 7 }));
	const github = createGitHubModule({ token: 'token', fetch });

	expect(await github.repositories.getStars('owner/repo')).toBe(7);
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

	expect(issues.map((item) => item.number)).toEqual([3, 4]);
	expect(requests[0].url.searchParams.get('per_page')).toBe('100');
	expect(requests[0].url.searchParams.get('state')).toBe('open');
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

	expect(issues.map((item) => item.number)).toEqual([100, 101]);
	expect(pages).toEqual([1, 2]);
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

	expect(url.searchParams.get('state')).toBe('all');
	expect(url.searchParams.get('labels')).toBe('good first issue,help wanted');
	expect(url.searchParams.get('sort')).toBe('updated');
	expect(url.searchParams.get('direction')).toBe('asc');
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
	const error = await github.repositories.get('owner/repo').catch((cause: unknown) => cause);

	expect(error).toBeInstanceOf(GitHubRateLimitError);

	const rateLimit = error as GitHubRateLimitError;

	expect(rateLimit.status).toBe(403);
	expect(rateLimit.remaining).toBe(0);
	expect(rateLimit.limit).toBe(60);
	expect(rateLimit.resetAt?.getTime()).toBe(1_700_000_000_000);
});

test('not found responses use the not_found error code', async () => {
	const fetch: GitHubFetch = async () => jsonResponse({ message: 'Not Found' }, { status: 404 });
	const github = createGitHubModule({ token: 'token', fetch });
	const error = await github.repositories.get('owner/repo').catch((cause: unknown) => cause);

	expect(error).toBeInstanceOf(GitHubApiError);

	const apiError = error as GitHubApiError;

	expect(apiError.code).toBe('not_found');
	expect(apiError.isNotFound).toBe(true);
});

test('a missing token fails fast with a configuration error', () => {
	expect(() => createGitHubModule({ token: '' })).toThrow(GitHubConfigurationError);
});

test('repository references are validated', () => {
	expect(normalizeRepositoryRef('owner/repo')).toEqual({ owner: 'owner', name: 'repo' });
	expect(normalizeRepositoryRef({ owner: 'owner', name: 'repo' })).toEqual({
		owner: 'owner',
		name: 'repo'
	});
	expect(() => normalizeRepositoryRef('owner')).toThrow(GitHubValidationError);
	expect(() => normalizeRepositoryRef('owner/repo/extra')).toThrow(GitHubValidationError);
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

	expect(requests[0].url.pathname).toBe('/repos/owner/repo/tarball/feature%2Fx');
	expect(tarball.filename).toBe('owner-repo-abc.tar.gz');
	expect(tarball.contentType).toBe('application/gzip');
	expect([...bytes]).toEqual([1, 2, 3]);
});

test('downloadRepositoryTarball writes the stream to disk', async () => {
	const directory = await mkdtemp(join(tmpdir(), 'kickin-github-'));
	onTestFinished(async () => rm(directory, { recursive: true, force: true }));

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

	expect(downloaded.bytes).toBe(3);
	expect(downloaded.filename).toBe('snapshot.tar.gz');
	expect(fileInfo.size).toBe(3);
	expect([...file]).toEqual([4, 5, 6]);
});

test('downloadRepositoryTarball refuses to overwrite when asked', async () => {
	const directory = await mkdtemp(join(tmpdir(), 'kickin-github-'));
	onTestFinished(async () => rm(directory, { recursive: true, force: true }));

	const fetch: GitHubFetch = async () => new Response(new Uint8Array([7]), { status: 200 });
	const github = createGitHubModule({ token: 'token', fetch });
	const destination = join(directory, 'snapshot.tar.gz');

	await github.tarballs.download('owner/repo', destination);

	await expect(
		github.tarballs.download('owner/repo', destination, { overwrite: false })
	).rejects.toBeInstanceOf(GitHubValidationError);
});

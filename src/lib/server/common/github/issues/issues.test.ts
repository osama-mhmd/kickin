import { expect, test } from 'vitest';
import { createGitHubModule } from '../index';
import type { GitHubFetch } from '../types';
import { issue, jsonResponse, type RecordedRequest } from '../testing/helpers';

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

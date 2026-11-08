import type { GitHubClient } from './client';
import { parseLinkHeader } from './client';
import { GitHubValidationError } from './errors';
import { normalizeRepositoryRef } from './repo';
import type { GitHubIssue, ListIssuesOptions, RepositoryRef } from './types';

const PAGE_SIZE = 100;
const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 1000;

export async function listIssues(
	client: GitHubClient,
	ref: RepositoryRef,
	options: ListIssuesOptions = {}
): Promise<GitHubIssue[]> {
	const { owner, name } = normalizeRepositoryRef(ref);
	const limit = normalizeInteger(options.limit ?? DEFAULT_LIMIT, 'limit', 1, MAX_LIMIT);
	const offset = normalizeInteger(options.offset ?? 0, 'offset', 0, Number.MAX_SAFE_INTEGER);
	const includePullRequests = options.includePullRequests ?? false;
	const state = options.state ?? 'open';
	const labels =
		options.labels === undefined
			? undefined
			: Array.isArray(options.labels)
				? options.labels
				: [options.labels];

	const issues: GitHubIssue[] = [];
	let page = includePullRequests ? Math.floor(offset / PAGE_SIZE) + 1 : 1;
	let remainingOffset = includePullRequests ? offset % PAGE_SIZE : offset;

	while (issues.length < limit) {
		const response = await client.requestJsonWithMeta<GitHubIssue[]>(
			`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/issues`,
			{
				query: {
					state,
					per_page: PAGE_SIZE,
					page,
					labels: labels?.join(','),
					sort: options.sort,
					direction: options.direction,
					since: options.since
				},
				signal: options.signal
			}
		);

		const fetched = response.data;

		if (fetched.length === 0) break;

		const candidates = includePullRequests
			? fetched
			: fetched.filter((issue) => issue.pull_request === undefined);

		if (remainingOffset > 0) {
			if (remainingOffset >= candidates.length) {
				remainingOffset -= candidates.length;
			} else {
				issues.push(...candidates.slice(remainingOffset, remainingOffset + limit - issues.length));
				remainingOffset = 0;
			}
		} else {
			issues.push(...candidates.slice(0, limit - issues.length));
		}

		if (!hasNextPage(response.headers, fetched.length)) break;

		page += 1;
	}

	return issues;
}

function hasNextPage(headers: Headers, received: number): boolean {
	const links = parseLinkHeader(headers.get('link'));

	if (typeof links.next === 'string') return true;
	if (Object.keys(links).length > 0) return false;

	return received >= PAGE_SIZE;
}

function normalizeInteger(value: number, name: string, min: number, max: number): number {
	if (!Number.isInteger(value) || value < min || value > max) {
		throw new GitHubValidationError(`"${name}" must be an integer between ${min} and ${max}.`);
	}

	return value;
}

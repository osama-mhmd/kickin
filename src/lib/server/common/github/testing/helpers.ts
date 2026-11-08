import type { GitHubIssue, GitHubRepository } from '../types';

export interface RecordedRequest {
	url: URL;
	init: RequestInit;
}

export function jsonResponse(
	data: unknown,
	options: { status?: number; headers?: Record<string, string> } = {}
): Response {
	return new Response(JSON.stringify(data), {
		status: options.status ?? 200,
		headers: { 'content-type': 'application/json', ...options.headers }
	});
}

export function repository(overrides: Partial<GitHubRepository> = {}): GitHubRepository {
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

export function issue(number: number, overrides: Partial<GitHubIssue> = {}): GitHubIssue {
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

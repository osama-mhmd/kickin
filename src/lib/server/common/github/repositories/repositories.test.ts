import { expect, test } from 'vitest';
import { createGitHubModule, GitHubValidationError, normalizeRepositoryRef } from '../index';
import type { GitHubFetch } from '../types';
import { jsonResponse, repository, type RecordedRequest } from '../testing/helpers';

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

test('repository references are validated', () => {
	expect(normalizeRepositoryRef('owner/repo')).toEqual({ owner: 'owner', name: 'repo' });
	expect(normalizeRepositoryRef({ owner: 'owner', name: 'repo' })).toEqual({
		owner: 'owner',
		name: 'repo'
	});
	expect(() => normalizeRepositoryRef('owner')).toThrow(GitHubValidationError);
	expect(() => normalizeRepositoryRef('owner/repo/extra')).toThrow(GitHubValidationError);
});

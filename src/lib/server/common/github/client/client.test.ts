import { expect, test } from 'vitest';
import {
	createGitHubModule,
	GitHubApiError,
	GitHubConfigurationError,
	GitHubRateLimitError
} from '../index';
import type { GitHubFetch } from '../types';
import { jsonResponse } from '../testing/helpers';

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

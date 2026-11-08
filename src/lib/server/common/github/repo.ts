import type { GitHubClient } from './client';
import { GitHubValidationError } from './errors';
import type { GitHubRepository, NormalizedRepositoryRef, RepositoryRef } from './types';

export function normalizeRepositoryRef(ref: RepositoryRef): NormalizedRepositoryRef {
	if (typeof ref === 'object' && ref !== null) {
		const owner = ref.owner.trim();
		const name = ref.name.trim();

		if (!owner || !name) {
			throw new GitHubValidationError('Repository owner and name are required.');
		}

		return { owner, name };
	}

	if (typeof ref !== 'string') {
		throw new GitHubValidationError(
			'Repository reference must be "owner/name" or an object with owner and name.'
		);
	}

	const parts = ref.trim().split('/');

	if (parts.length !== 2) {
		throw new GitHubValidationError('Repository reference must use the "owner/name" format.');
	}

	const owner = parts[0].trim();
	const name = parts[1].trim();

	if (!owner || !name) {
		throw new GitHubValidationError('Repository reference must use the "owner/name" format.');
	}

	return { owner, name };
}

export async function getRepository(
	client: GitHubClient,
	ref: RepositoryRef
): Promise<GitHubRepository> {
	const { owner, name } = normalizeRepositoryRef(ref);

	return client.requestJson<GitHubRepository>(
		`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`
	);
}

export async function getRepositoryStars(
	client: GitHubClient,
	ref: RepositoryRef
): Promise<number> {
	const repository = await getRepository(client, ref);

	return repository.stargazers_count;
}

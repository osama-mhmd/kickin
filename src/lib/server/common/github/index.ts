import { GitHubClient } from './client';
import { getRepository, getRepositoryStars } from './repo';
import { listIssues } from './issues';
import { downloadRepositoryTarball, fetchRepositoryTarball } from './tarball';
import type {
	DownloadTarballOptions,
	FetchTarballOptions,
	GitHubClientOptions,
	ListIssuesOptions,
	RepositoryRef
} from './types';

export * from './types';
export * from './errors';
export { GitHubClient, parseLinkHeader } from './client';
export { getRepository, getRepositoryStars, normalizeRepositoryRef } from './repo';
export { listIssues } from './issues';
export { downloadRepositoryTarball, fetchRepositoryTarball } from './tarball';

export function createGitHubModule(options: GitHubClientOptions = {}) {
	const client = new GitHubClient(options);

	return {
		client,
		repositories: {
			get: (ref: RepositoryRef) => getRepository(client, ref),
			getStars: (ref: RepositoryRef) => getRepositoryStars(client, ref)
		},
		issues: {
			list: (ref: RepositoryRef, listOptions?: ListIssuesOptions) =>
				listIssues(client, ref, listOptions)
		},
		tarballs: {
			fetch: (ref: RepositoryRef, tarballOptions?: FetchTarballOptions) =>
				fetchRepositoryTarball(client, ref, tarballOptions),
			download: (
				ref: RepositoryRef,
				destination: string,
				downloadOptions?: DownloadTarballOptions
			) => downloadRepositoryTarball(client, ref, destination, downloadOptions)
		}
	};
}

export type GitHubModule = ReturnType<typeof createGitHubModule>;

let defaultModule: GitHubModule | undefined;

export function getGitHubModule(): GitHubModule {
	defaultModule ??= createGitHubModule();

	return defaultModule;
}

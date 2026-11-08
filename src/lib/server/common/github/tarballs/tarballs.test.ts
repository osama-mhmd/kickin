import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, onTestFinished, test } from 'vitest';
import { createGitHubModule, GitHubValidationError } from '../index';
import type { GitHubFetch } from '../types';
import type { RecordedRequest } from '../testing/helpers';

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

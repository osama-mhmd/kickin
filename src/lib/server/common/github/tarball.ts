import { createWriteStream } from 'node:fs';
import { mkdir, rename, rm, stat } from 'node:fs/promises';
import { basename, dirname, join, sep } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream as NodeReadableStream } from 'node:stream/web';
import type { GitHubClient } from './client';
import { GitHubError, GitHubNetworkError, GitHubValidationError } from './errors';
import { normalizeRepositoryRef } from './repo';
import type {
	DownloadTarballOptions,
	DownloadedTarball,
	FetchTarballOptions,
	RepositoryRef,
	RepositoryTarball
} from './types';

export async function fetchRepositoryTarball(
	client: GitHubClient,
	ref: RepositoryRef,
	options: FetchTarballOptions = {}
): Promise<RepositoryTarball> {
	const { owner, name } = normalizeRepositoryRef(ref);
	const refPath = options.ref === undefined ? '' : `/${encodeURIComponent(options.ref)}`;
	const response = await client.request(
		`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/tarball${refPath}`,
		{
			accept: 'application/vnd.github+json',
			redirect: 'follow',
			signal: options.signal
		}
	);

	if (!response.body) {
		throw new GitHubError('GitHub returned an empty tarball response.', {
			code: 'http',
			status: response.status,
			requestUrl: response.url
		});
	}

	const filename = getFilenameFromContentDisposition(response.headers.get('content-disposition'));

	return {
		stream: response.body,
		contentType: response.headers.get('content-type'),
		contentLength: toNumber(response.headers.get('content-length')),
		etag: response.headers.get('etag'),
		filename: filename === null ? null : safeFilename(filename),
		url: response.url
	};
}

export async function downloadRepositoryTarball(
	client: GitHubClient,
	ref: RepositoryRef,
	destination: string,
	options: DownloadTarballOptions = {}
): Promise<DownloadedTarball> {
	const { owner, name } = normalizeRepositoryRef(ref);
	const tarball = await fetchRepositoryTarball(client, ref, options);
	const fallbackFilename = safeFilename(`${owner}-${name}-${options.ref ?? 'default'}.tar.gz`);
	const filePath = await resolveFilePath(
		destination,
		options.filename ?? tarball.filename ?? fallbackFilename
	);
	const directory = dirname(filePath);

	await mkdir(directory, { recursive: true });

	if (options.overwrite === false && (await pathExists(filePath))) {
		throw new GitHubValidationError(`Tarball already exists at ${filePath}.`);
	}

	const temporaryPath = join(directory, `.${basename(filePath)}.${process.pid}.${Date.now()}.tmp`);
	let bytes = 0;

	const counter = new Transform({
		transform(chunk: Buffer, _encoding, callback) {
			bytes += chunk.length;
			callback(null, chunk);
		}
	});

	try {
		await pipeline(
			Readable.fromWeb(tarball.stream as unknown as NodeReadableStream<Uint8Array>),
			counter,
			createWriteStream(temporaryPath)
		);
		await rename(temporaryPath, filePath);
	} catch (cause) {
		await rm(temporaryPath, { force: true });

		if (cause instanceof GitHubError) throw cause;

		throw new GitHubNetworkError(`Failed to download tarball to ${filePath}.`, {
			requestUrl: tarball.url,
			cause
		});
	}

	return {
		path: filePath,
		filename: basename(filePath),
		bytes,
		contentType: tarball.contentType
	};
}

async function resolveFilePath(destination: string, fallbackFilename: string): Promise<string> {
	const trimmed = destination.trim();

	if (!trimmed) {
		throw new GitHubValidationError('A download destination is required.');
	}

	const isDirectoryPath =
		trimmed.endsWith('/') || trimmed.endsWith(sep) || (await isDirectory(trimmed));

	return isDirectoryPath ? join(trimmed, safeFilename(fallbackFilename)) : trimmed;
}

async function isDirectory(path: string): Promise<boolean> {
	try {
		return (await stat(path)).isDirectory();
	} catch (cause) {
		if (isMissingPath(cause)) return false;

		throw cause;
	}
}

async function pathExists(path: string): Promise<boolean> {
	try {
		await stat(path);

		return true;
	} catch (cause) {
		if (isMissingPath(cause)) return false;

		throw cause;
	}
}

function isMissingPath(error: unknown): boolean {
	return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

function safeFilename(filename: string): string {
	const base = basename(filename)
		.replace(/[^a-zA-Z0-9._-]+/g, '-')
		.replace(/^[-.]+|[-.]+$/g, '');

	return base.length > 0 ? base : 'repository.tar.gz';
}

function getFilenameFromContentDisposition(header: string | null): string | null {
	if (!header) return null;

	const encoded = /filename\*\s*=\s*UTF-8''([^;]+)/i.exec(header);

	if (encoded) {
		try {
			return decodeURIComponent(encoded[1].trim());
		} catch {
			return encoded[1].trim();
		}
	}

	const plain = /filename\s*=\s*"?([^";]+)"?/i.exec(header);

	return plain ? plain[1].trim() : null;
}

function toNumber(value: string | null): number | null {
	if (value === null) return null;

	const parsed = Number(value);

	return Number.isFinite(parsed) ? parsed : null;
}

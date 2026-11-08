import { createReadStream } from 'node:fs';
import { Readable } from 'node:stream';
import type { ReadableStream as NodeReadableStream } from 'node:stream/web';
import { Parser } from 'tar';
import { AstAbortError, AstTarballError, AstValidationError } from './errors';
import { detectLanguage } from './languages';
import {
	detectAutomaticRoot,
	looksBinary,
	normalizeEntryPath,
	shouldIgnorePath,
	toRelativePath
} from './tarball-paths';
import type {
	ReadTarballOptions,
	TarballExtraction,
	TarballInput,
	TarballSkippedFile,
	TarballSkipReason,
	TarballSourceFile,
	TarballStats
} from './types';

const DEFAULT_OPTIONS = {
	maxEntries: 50_000,
	maxFileBytes: 1_048_576,
	maxTotalBytes: 33_554_432,
	maxArchiveBytes: 268_435_456
};

interface ResolvedTarballOptions {
	root: string | false | undefined;
	maxEntries: number;
	maxFileBytes: number;
	maxTotalBytes: number;
	maxArchiveBytes: number;
	includeUnsupported: boolean;
	shouldInclude?: (path: string) => boolean;
	signal?: AbortSignal;
}

export async function readTarballSourceFiles(
	input: TarballInput,
	options: ReadTarballOptions = {}
): Promise<TarballExtraction> {
	const resolved = resolveTarballOptions(options);
	const files: TarballSourceFile[] = [];
	const skipped: TarballSkippedFile[] = [];
	const reasons: Partial<Record<TarballSkipReason, number>> = {};
	let entries = 0;
	let totalBytes = 0;
	let truncated = false;
	let stopped = false;
	let root: string | null = typeof resolved.root === 'string' ? resolved.root : null;
	let rootResolved = resolved.root !== undefined;

	const recordSkip = (path: string, reason: TarballSkipReason, bytes?: number): void => {
		const entry: TarballSkippedFile = { path, reason };

		if (bytes !== undefined) entry.bytes = bytes;

		skipped.push(entry);
		reasons[reason] = (reasons[reason] ?? 0) + 1;
	};

	const parser = new Parser({
		onReadEntry: (entry) => {
			entries += 1;

			if (stopped || entries > resolved.maxEntries) {
				if (entries > resolved.maxEntries) {
					truncated = true;
					stopped = true;
				}

				entry.resume();

				return;
			}

			if (resolved.signal?.aborted) {
				entry.resume();

				return;
			}

			const normalized = normalizeEntryPath(entry.path);

			if (!normalized) {
				recordSkip(entry.path, 'outside_root');
				entry.resume();

				return;
			}

			if (!rootResolved) {
				root = typeof resolved.root === 'string' ? resolved.root : detectAutomaticRoot(entry.path);
				rootResolved = true;
			}

			const relative = toRelativePath(normalized, root);

			if (relative === null) {
				recordSkip(normalized, 'outside_root');
				entry.resume();

				return;
			}

			if (entry.type !== 'File') {
				if (entry.type === 'SymbolicLink' || entry.type === 'Link') {
					recordSkip(relative, 'not_a_file');
				}

				entry.resume();

				return;
			}

			if (entry.size > resolved.maxFileBytes) {
				recordSkip(relative, 'too_large', entry.size);
				entry.resume();

				return;
			}

			if (shouldIgnorePath(relative, resolved.shouldInclude)) {
				recordSkip(relative, 'ignored', entry.size);
				entry.resume();

				return;
			}

			const pathDefinition = detectLanguage(relative);
			const chunks: Buffer[] = [];
			let fileBytes = 0;
			let exceeded: TarballSkipReason | null = null;

			entry.on('data', (chunk: Buffer) => {
				if (exceeded) return;

				fileBytes += chunk.length;

				if (fileBytes > resolved.maxFileBytes) {
					exceeded = 'too_large';
					chunks.length = 0;

					return;
				}

				if (totalBytes + fileBytes > resolved.maxTotalBytes) {
					exceeded = 'total_limit';
					chunks.length = 0;

					return;
				}

				chunks.push(chunk);
			});

			entry.on('error', () => {
				exceeded = 'total_limit';
				chunks.length = 0;
			});

			entry.on('end', () => {
				if (exceeded) {
					recordSkip(relative, exceeded, fileBytes);

					if (exceeded === 'total_limit') truncated = true;

					return;
				}

				const buffer = Buffer.concat(chunks, fileBytes);

				if (looksBinary(buffer)) {
					recordSkip(relative, 'binary', fileBytes);

					return;
				}

				let content: string;

				try {
					content = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
				} catch {
					recordSkip(relative, 'invalid_encoding', fileBytes);

					return;
				}

				const definition = pathDefinition ?? detectLanguage(relative, content);

				if (!definition && !resolved.includeUnsupported) {
					recordSkip(relative, 'unsupported_language', fileBytes);

					return;
				}

				totalBytes += fileBytes;
				files.push({
					path: relative,
					content,
					bytes: fileBytes,
					language: definition?.id ?? null
				});
			});

			entry.resume();
		}
	});

	await feedParser(parser, input, resolved.maxArchiveBytes, resolved.signal);

	if (resolved.signal?.aborted) {
		throw new AstAbortError();
	}

	const stats: TarballStats = {
		entries,
		files: files.length,
		skipped: skipped.length,
		bytes: totalBytes,
		reasons,
		truncated
	};

	return { root, files, skipped, stats };
}

async function feedParser(
	parser: Parser,
	input: TarballInput,
	maxArchiveBytes: number,
	signal: AbortSignal | undefined
): Promise<void> {
	const readable = toReadable(input);
	let archiveBytes = 0;
	let parserError: Error | undefined;

	const onParserError = (cause: Error) => {
		parserError ??= cause;
	};

	parser.on('error', onParserError);

	try {
		for await (const chunk of readable) {
			if (signal?.aborted) throw new AstAbortError();
			if (parserError) break;

			const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);

			archiveBytes += buffer.length;

			if (archiveBytes > maxArchiveBytes) {
				throw new AstTarballError(
					`Tarball exceeded the maximum archive size of ${maxArchiveBytes} bytes.`
				);
			}

			if (!parser.write(buffer)) await waitForDrainOrError(parser);
		}

		if (signal?.aborted) throw new AstAbortError();
		if (parserError) throw parserError;
	} catch (cause) {
		readable.destroy();

		if (cause instanceof AstAbortError || cause instanceof AstTarballError) throw cause;

		throw new AstTarballError('Failed to read the tarball input.', { cause });
	}

	try {
		await new Promise<void>((resolve, reject) => {
			if (parserError) {
				reject(new AstTarballError('The tarball could not be parsed.', { cause: parserError }));
				return;
			}

			const onEnd = () => {
				parser.off('error', onError);
				resolve();
			};
			const onError = (cause: Error) => {
				parser.off('end', onEnd);
				reject(new AstTarballError('The tarball could not be parsed.', { cause }));
			};

			parser.once('end', onEnd);
			parser.once('error', onError);
			parser.end();
		});
	} finally {
		parser.off('error', onParserError);
	}
}

function waitForDrainOrError(parser: Parser): Promise<void> {
	return new Promise((resolve) => {
		const done = () => {
			parser.off('drain', done);
			parser.off('error', done);
			resolve();
		};

		parser.once('drain', done);
		parser.once('error', done);
	});
}

function toReadable(input: TarballInput): Readable {
	if (typeof input === 'string') return createReadStream(input);

	if (input instanceof Uint8Array) return Readable.from([input]);

	if (isWebReadableStream(input)) {
		return Readable.fromWeb(input as unknown as NodeReadableStream<Uint8Array>);
	}

	return input;
}

function isWebReadableStream(value: TarballInput): value is ReadableStream<Uint8Array> {
	return typeof (value as ReadableStream<Uint8Array>).getReader === 'function';
}

function resolveTarballOptions(options: ReadTarballOptions): ResolvedTarballOptions {
	let root: string | false | undefined = options.root;

	if (typeof root === 'string') {
		root = root.replace(/^\/+|\/+$/g, '');

		if (root.length === 0) {
			throw new AstValidationError('root must be a non-empty path or false.');
		}

		if (root.split('/').some((segment) => segment === '..')) {
			throw new AstValidationError('root must not contain ".." segments.');
		}
	}

	return {
		root,
		maxEntries: positiveInteger(options.maxEntries, 'maxEntries', DEFAULT_OPTIONS.maxEntries),
		maxFileBytes: positiveInteger(
			options.maxFileBytes,
			'maxFileBytes',
			DEFAULT_OPTIONS.maxFileBytes
		),
		maxTotalBytes: positiveInteger(
			options.maxTotalBytes,
			'maxTotalBytes',
			DEFAULT_OPTIONS.maxTotalBytes
		),
		maxArchiveBytes: positiveInteger(
			options.maxArchiveBytes,
			'maxArchiveBytes',
			DEFAULT_OPTIONS.maxArchiveBytes
		),
		includeUnsupported: options.includeUnsupported ?? false,
		shouldInclude: options.shouldInclude,
		signal: options.signal
	};
}

function positiveInteger(value: number | undefined, name: string, fallback: number): number {
	if (value === undefined) return fallback;

	if (!Number.isInteger(value) || value <= 0) {
		throw new AstValidationError(`${name} must be a positive integer.`);
	}

	return value;
}

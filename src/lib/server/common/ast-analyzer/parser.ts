import Parser from 'tree-sitter';
import { AstAbortError, AstValidationError } from './errors';
import { detectLanguage, getLanguageDefinition, loadLanguage } from './languages';
import { serializeTree } from './serializer';
import type {
	AstAnalyzerOptions,
	AstCompilation,
	AstCompiledFile,
	AstFileError,
	AstSourceFile,
	AstTextMode
} from './types';

const DEFAULT_OPTIONS = {
	includeAnonymous: false,
	includeText: 'leaves' as AstTextMode,
	maxNodesPerFile: 20_000,
	maxTotalNodes: 1_000_000,
	maxDepth: 200,
	maxTextLength: 2_000,
	maxFiles: 5_000,
	maxFileBytes: 1_048_576
};

export interface ResolvedAstAnalyzerOptions {
	includeAnonymous: boolean;
	includeText: AstTextMode;
	maxNodesPerFile: number;
	maxTotalNodes: number;
	maxDepth: number;
	maxTextLength: number;
	maxFiles: number;
	maxFileBytes: number;
	metadata?: Record<string, unknown>;
	signal?: AbortSignal;
	now: () => Date;
}

export function resolveAstAnalyzerOptions(
	options: AstAnalyzerOptions = {}
): ResolvedAstAnalyzerOptions {
	const includeText = options.includeText ?? DEFAULT_OPTIONS.includeText;

	if (includeText !== 'none' && includeText !== 'leaves' && includeText !== 'all') {
		throw new AstValidationError('includeText must be "none", "leaves", or "all".');
	}

	return {
		includeAnonymous: options.includeAnonymous ?? DEFAULT_OPTIONS.includeAnonymous,
		includeText,
		maxNodesPerFile: positiveInteger(
			options.maxNodesPerFile,
			'maxNodesPerFile',
			DEFAULT_OPTIONS.maxNodesPerFile
		),
		maxTotalNodes: positiveInteger(
			options.maxTotalNodes,
			'maxTotalNodes',
			DEFAULT_OPTIONS.maxTotalNodes
		),
		maxDepth: nonNegativeInteger(options.maxDepth, 'maxDepth', DEFAULT_OPTIONS.maxDepth),
		maxTextLength: nonNegativeInteger(
			options.maxTextLength,
			'maxTextLength',
			DEFAULT_OPTIONS.maxTextLength
		),
		maxFiles: positiveInteger(options.maxFiles, 'maxFiles', DEFAULT_OPTIONS.maxFiles),
		maxFileBytes: positiveInteger(
			options.maxFileBytes,
			'maxFileBytes',
			DEFAULT_OPTIONS.maxFileBytes
		),
		metadata: options.metadata,
		signal: options.signal,
		now: options.now ?? (() => new Date())
	};
}

export async function analyzeSourceFile(
	file: AstSourceFile,
	options: AstAnalyzerOptions = {}
): Promise<AstCompiledFile> {
	const resolved = resolveAstAnalyzerOptions(options);

	assertNotAborted(resolved.signal);

	return analyzeFileWithOptions(file, resolved, resolved.maxNodesPerFile);
}

export async function analyzeSourceFiles(
	files: AstSourceFile[],
	options: AstAnalyzerOptions = {}
): Promise<AstCompilation> {
	const resolved = resolveAstAnalyzerOptions(options);
	const startedAt = Date.now();
	const results: AstCompiledFile[] = [];
	const limit = Math.min(files.length, resolved.maxFiles);
	let remainingNodes = resolved.maxTotalNodes;

	for (let index = 0; index < limit; index += 1) {
		assertNotAborted(resolved.signal);

		const file = files[index];

		if (remainingNodes <= 0) {
			results.push(skippedFile(file, 'total_node_limit'));
			continue;
		}

		const result = await analyzeFileWithOptions(
			file,
			resolved,
			Math.min(resolved.maxNodesPerFile, remainingNodes)
		);

		remainingNodes -= result.nodeCount;
		results.push(result);
	}

	const compilation: AstCompilation = {
		version: 1,
		generatedAt: resolved.now().toISOString(),
		files: results,
		summary: summarize(files.length, results, Date.now() - startedAt)
	};

	if (resolved.metadata !== undefined) {
		compilation.metadata = resolved.metadata;
	}

	return compilation;
}

async function analyzeFileWithOptions(
	file: AstSourceFile,
	options: ResolvedAstAnalyzerOptions,
	maxNodes: number
): Promise<AstCompiledFile> {
	const bytes = Buffer.byteLength(file.content, 'utf8');
	const lineCount = countLines(file.content);

	if (bytes > options.maxFileBytes) {
		return {
			...baseFile(file.path, bytes, lineCount),
			language: file.language ?? null,
			status: 'skipped',
			skipReason: 'too_large'
		};
	}

	const definition = file.language
		? getLanguageDefinition(file.language)
		: detectLanguage(file.path, file.content);

	if (!definition) {
		return {
			...baseFile(file.path, bytes, lineCount),
			language: file.language ?? null,
			status: 'unsupported'
		};
	}

	let grammar: Parser.Language;

	try {
		grammar = await loadLanguage(definition);
	} catch (cause) {
		return {
			...baseFile(file.path, bytes, lineCount),
			language: definition.id,
			status: 'failed',
			error: fileError('language_unavailable', cause)
		};
	}

	try {
		const parser = new Parser();
		parser.setLanguage(grammar);
		const tree = parser.parse(file.content);
		const serialized = serializeTree(tree.rootNode, {
			includeAnonymous: options.includeAnonymous,
			includeText: options.includeText,
			maxNodes,
			maxDepth: options.maxDepth,
			maxTextLength: options.maxTextLength
		});

		return {
			...baseFile(file.path, bytes, lineCount),
			language: definition.id,
			status: 'parsed',
			nodeCount: serialized.nodeCount,
			errorCount: serialized.errorCount,
			hasError: tree.rootNode.hasError,
			truncated: serialized.truncated,
			tree: serialized.root
		};
	} catch (cause) {
		return {
			...baseFile(file.path, bytes, lineCount),
			language: definition.id,
			status: 'failed',
			error: fileError('parse_failed', cause)
		};
	}
}

function baseFile(path: string, bytes: number, lineCount: number) {
	return {
		path,
		bytes,
		lineCount,
		nodeCount: 0,
		errorCount: 0,
		hasError: false,
		truncated: false
	};
}

function skippedFile(file: AstSourceFile, reason: 'total_node_limit'): AstCompiledFile {
	return {
		...baseFile(file.path, Buffer.byteLength(file.content, 'utf8'), countLines(file.content)),
		language: file.language ?? null,
		status: 'skipped',
		skipReason: reason
	};
}

function summarize(
	inputFiles: number,
	files: AstCompiledFile[],
	durationMs: number
): AstCompilation['summary'] {
	const languages: Record<string, number> = {};
	let parsedFiles = 0;
	let failedFiles = 0;
	let unsupportedFiles = 0;
	let skippedFiles = 0;
	let filesWithErrors = 0;
	let truncatedFiles = 0;
	let nodeCount = 0;

	for (const file of files) {
		nodeCount += file.nodeCount;

		if (file.status === 'parsed') parsedFiles += 1;
		else if (file.status === 'failed') failedFiles += 1;
		else if (file.status === 'unsupported') unsupportedFiles += 1;
		else skippedFiles += 1;

		if (file.errorCount > 0) filesWithErrors += 1;
		if (file.truncated) truncatedFiles += 1;

		if (file.status === 'parsed' && file.language) {
			languages[file.language] = (languages[file.language] ?? 0) + 1;
		}
	}

	return {
		inputFiles,
		analyzedFiles: files.length,
		parsedFiles,
		failedFiles,
		unsupportedFiles,
		skippedFiles,
		filesWithErrors,
		truncatedFiles,
		nodeCount,
		languages,
		durationMs
	};
}

function countLines(content: string): number {
	if (content.length === 0) return 0;

	let lines = 1;

	for (let index = 0; index < content.length; index += 1) {
		if (content.charCodeAt(index) === 10) lines += 1;
	}

	return lines;
}

function fileError(code: string, cause: unknown): AstFileError {
	return {
		code,
		message: cause instanceof Error ? cause.message : String(cause)
	};
}

function assertNotAborted(signal: AbortSignal | undefined): void {
	if (signal?.aborted) {
		throw new AstAbortError();
	}
}

function positiveInteger(value: number | undefined, name: string, fallback: number): number {
	if (value === undefined) return fallback;

	if (!Number.isInteger(value) || value <= 0) {
		throw new AstValidationError(`${name} must be a positive integer.`);
	}

	return value;
}

function nonNegativeInteger(value: number | undefined, name: string, fallback: number): number {
	if (value === undefined) return fallback;

	if (!Number.isInteger(value) || value < 0) {
		throw new AstValidationError(`${name} must be a non-negative integer.`);
	}

	return value;
}

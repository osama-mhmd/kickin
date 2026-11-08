import type { Readable } from 'node:stream';

export type AstLanguageId = string;

export interface AstPoint {
	row: number;
	column: number;
}

export type AstTextMode = 'none' | 'leaves' | 'all';

export interface AstNode {
	type: string;
	named: boolean;
	field?: string;
	start: AstPoint;
	end: AstPoint;
	startIndex: number;
	endIndex: number;
	text?: string;
	textTruncated?: boolean;
	error?: boolean;
	truncated?: boolean;
	children?: AstNode[];
}

export interface AstSourceFile {
	path: string;
	content: string;
	language?: AstLanguageId;
}

export type AstFileStatus = 'parsed' | 'failed' | 'unsupported' | 'skipped';

export type AstSkipReason = 'too_large' | 'file_limit' | 'total_node_limit';

export interface AstFileError {
	code: string;
	message: string;
}

export interface AstCompiledFile {
	path: string;
	language: AstLanguageId | null;
	status: AstFileStatus;
	bytes: number;
	lineCount: number;
	nodeCount: number;
	errorCount: number;
	hasError: boolean;
	truncated: boolean;
	tree?: AstNode;
	error?: AstFileError;
	skipReason?: AstSkipReason;
}

export interface AstCompilationSummary {
	inputFiles: number;
	analyzedFiles: number;
	parsedFiles: number;
	failedFiles: number;
	unsupportedFiles: number;
	skippedFiles: number;
	filesWithErrors: number;
	truncatedFiles: number;
	nodeCount: number;
	languages: Record<string, number>;
	durationMs: number;
}

export interface AstCompilation {
	version: 1;
	generatedAt: string;
	metadata?: Record<string, unknown>;
	files: AstCompiledFile[];
	summary: AstCompilationSummary;
}

export interface AstAnalyzerOptions {
	includeAnonymous?: boolean;
	includeText?: AstTextMode;
	maxNodesPerFile?: number;
	maxTotalNodes?: number;
	maxDepth?: number;
	maxTextLength?: number;
	maxFiles?: number;
	maxFileBytes?: number;
	metadata?: Record<string, unknown>;
	signal?: AbortSignal;
	now?: () => Date;
}

export type TarballInput = string | Uint8Array | Readable | ReadableStream<Uint8Array>;

export type TarballSkipReason =
	| 'ignored'
	| 'binary'
	| 'invalid_encoding'
	| 'too_large'
	| 'unsupported_language'
	| 'outside_root'
	| 'not_a_file'
	| 'entry_limit'
	| 'total_limit';

export interface TarballSkippedFile {
	path: string;
	reason: TarballSkipReason;
	bytes?: number;
}

export interface TarballSourceFile {
	path: string;
	content: string;
	bytes: number;
	language: AstLanguageId | null;
}

export interface TarballStats {
	entries: number;
	files: number;
	skipped: number;
	bytes: number;
	reasons: Partial<Record<TarballSkipReason, number>>;
	truncated: boolean;
}

export interface TarballExtraction {
	root: string | null;
	files: TarballSourceFile[];
	skipped: TarballSkippedFile[];
	stats: TarballStats;
}

export interface ReadTarballOptions {
	root?: string | false;
	maxEntries?: number;
	maxFileBytes?: number;
	maxTotalBytes?: number;
	maxArchiveBytes?: number;
	includeUnsupported?: boolean;
	shouldInclude?: (path: string) => boolean;
	signal?: AbortSignal;
}

export interface AnalyzeTarballOptions {
	tarball?: ReadTarballOptions;
	analysis?: AstAnalyzerOptions;
}

export interface AstTarballFile {
	path: string;
	language: AstLanguageId | null;
	bytes: number;
}

export interface AstTarballAnalysis {
	compilation: AstCompilation;
	root: string | null;
	files: AstTarballFile[];
	skipped: TarballSkippedFile[];
}

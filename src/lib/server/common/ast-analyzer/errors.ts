export type AstErrorCode =
	| 'configuration'
	| 'validation'
	| 'language'
	| 'parse'
	| 'tarball'
	| 'limit'
	| 'aborted';

export interface AstErrorOptions {
	code: AstErrorCode;
	details?: unknown;
	cause?: unknown;
}

export class AstAnalyzerError extends Error {
	readonly code: AstErrorCode;
	readonly details: unknown;

	constructor(message: string, options: AstErrorOptions) {
		super(message, options.cause === undefined ? undefined : { cause: options.cause });

		this.name = 'AstAnalyzerError';
		this.code = options.code;
		this.details = options.details;
	}
}

export class AstValidationError extends AstAnalyzerError {
	constructor(message: string, options: { details?: unknown } = {}) {
		super(message, { code: 'validation', details: options.details });

		this.name = 'AstValidationError';
	}
}

export class AstLanguageError extends AstAnalyzerError {
	constructor(message: string, options: { details?: unknown; cause?: unknown } = {}) {
		super(message, { code: 'language', details: options.details, cause: options.cause });

		this.name = 'AstLanguageError';
	}
}

export class AstTarballError extends AstAnalyzerError {
	constructor(message: string, options: { details?: unknown; cause?: unknown } = {}) {
		super(message, { code: 'tarball', details: options.details, cause: options.cause });

		this.name = 'AstTarballError';
	}
}

export class AstAbortError extends AstAnalyzerError {
	constructor(message = 'AST analysis was aborted.') {
		super(message, { code: 'aborted' });

		this.name = 'AstAbortError';
	}
}

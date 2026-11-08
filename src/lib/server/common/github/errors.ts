export type GitHubErrorCode =
	| 'configuration'
	| 'network'
	| 'validation'
	| 'http'
	| 'authentication'
	| 'not_found'
	| 'rate_limit';

export interface GitHubErrorOptions {
	code: GitHubErrorCode;
	status?: number;
	requestUrl?: string;
	details?: unknown;
	cause?: unknown;
}

export class GitHubError extends Error {
	readonly code: GitHubErrorCode;
	readonly status: number | undefined;
	readonly requestUrl: string | undefined;
	readonly details: unknown;

	constructor(message: string, options: GitHubErrorOptions) {
		super(message, options.cause === undefined ? undefined : { cause: options.cause });

		this.name = 'GitHubError';
		this.code = options.code;
		this.status = options.status;
		this.requestUrl = options.requestUrl;
		this.details = options.details;
	}
}

export class GitHubConfigurationError extends GitHubError {
	constructor(message: string) {
		super(message, { code: 'configuration' });

		this.name = 'GitHubConfigurationError';
	}
}

export class GitHubValidationError extends GitHubError {
	constructor(message: string) {
		super(message, { code: 'validation' });

		this.name = 'GitHubValidationError';
	}
}

export class GitHubNetworkError extends GitHubError {
	constructor(message: string, options: { requestUrl?: string; cause?: unknown } = {}) {
		super(message, { code: 'network', requestUrl: options.requestUrl, cause: options.cause });

		this.name = 'GitHubNetworkError';
	}
}

export interface GitHubApiErrorOptions {
	status: number;
	requestUrl?: string;
	details?: unknown;
	code?: GitHubErrorCode;
}

export class GitHubApiError extends GitHubError {
	readonly isNotFound: boolean;

	constructor(message: string, options: GitHubApiErrorOptions) {
		const code =
			options.code ??
			(options.status === 404 ? 'not_found' : options.status === 401 ? 'authentication' : 'http');

		super(message, {
			code,
			status: options.status,
			requestUrl: options.requestUrl,
			details: options.details
		});

		this.name = 'GitHubApiError';
		this.isNotFound = options.status === 404;
	}
}

export interface GitHubRateLimitErrorOptions extends GitHubApiErrorOptions {
	resetAt?: Date | null;
	remaining?: number | null;
	limit?: number | null;
}

export class GitHubRateLimitError extends GitHubApiError {
	readonly resetAt: Date | null;
	readonly remaining: number | null;
	readonly limit: number | null;

	constructor(message: string, options: GitHubRateLimitErrorOptions) {
		super(message, { ...options, code: 'rate_limit' });

		this.name = 'GitHubRateLimitError';
		this.resetAt = options.resetAt ?? null;
		this.remaining = options.remaining ?? null;
		this.limit = options.limit ?? null;
	}
}

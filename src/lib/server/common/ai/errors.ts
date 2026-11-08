import type { AiAttempt, AiErrorCode, AiProviderName } from '#lib/ai/types.ts';

export interface AiErrorOptions {
	code: AiErrorCode;
	provider?: AiProviderName;
	model?: string;
	status?: number;
	details?: unknown;
	cause?: unknown;
}

export class AiError extends Error {
	readonly code: AiErrorCode;
	readonly provider: AiProviderName | undefined;
	readonly model: string | undefined;
	readonly status: number | undefined;
	readonly details: unknown;

	constructor(message: string, options: AiErrorOptions) {
		super(message, options.cause === undefined ? undefined : { cause: options.cause });

		this.name = 'AiError';
		this.code = options.code;
		this.provider = options.provider;
		this.model = options.model;
		this.status = options.status;
		this.details = options.details;
	}
}

export class AiConfigurationError extends AiError {
	constructor(
		message: string,
		options: { provider?: AiProviderName; model?: string; details?: unknown; cause?: unknown } = {}
	) {
		super(message, { code: 'configuration', ...options });

		this.name = 'AiConfigurationError';
	}
}

export class AiValidationError extends AiError {
	constructor(message: string) {
		super(message, { code: 'validation' });

		this.name = 'AiValidationError';
	}
}

export interface AiProviderErrorOptions {
	provider: AiProviderName;
	model: string;
	status?: number;
	details?: unknown;
	cause?: unknown;
	code?: AiErrorCode;
}

export class AiProviderError extends AiError {
	constructor(message: string, options: AiProviderErrorOptions) {
		super(message, { ...options, code: options.code ?? 'http' });

		this.name = 'AiProviderError';
	}
}

export interface AiRateLimitErrorOptions extends AiProviderErrorOptions {
	resetAt?: Date | null;
}

export class AiRateLimitError extends AiProviderError {
	readonly resetAt: Date | null;

	constructor(message: string, options: AiRateLimitErrorOptions) {
		super(message, { ...options, code: 'rate_limit' });

		this.name = 'AiRateLimitError';
		this.resetAt = options.resetAt ?? null;
	}
}

export class AiTimeoutError extends AiProviderError {
	constructor(message: string, options: AiProviderErrorOptions) {
		super(message, { ...options, code: 'timeout' });

		this.name = 'AiTimeoutError';
	}
}

export class AiAbortedError extends AiError {
	constructor(message: string, options: { provider?: AiProviderName; model?: string } = {}) {
		super(message, { code: 'aborted', ...options });

		this.name = 'AiAbortedError';
	}
}

export class AiInvalidResponseError extends AiProviderError {
	constructor(message: string, options: AiProviderErrorOptions) {
		super(message, { ...options, code: 'invalid_response' });

		this.name = 'AiInvalidResponseError';
	}
}

export class AiInvalidJsonError extends AiProviderError {
	readonly raw: string;

	constructor(
		message: string,
		options: { provider: AiProviderName; model: string; raw: string; cause?: unknown }
	) {
		super(message, { ...options, code: 'invalid_json' });

		this.name = 'AiInvalidJsonError';
		this.raw = options.raw;
	}
}

export class AiSchemaError extends AiProviderError {
	readonly problems: string[];
	readonly raw: string;

	constructor(
		message: string,
		options: {
			provider: AiProviderName;
			model: string;
			raw: string;
			problems: string[];
			cause?: unknown;
		}
	) {
		super(message, { ...options, code: 'schema' });

		this.name = 'AiSchemaError';
		this.problems = options.problems;
		this.raw = options.raw;
	}
}

export class AiCheckError extends AiProviderError {
	readonly problems: string[];
	readonly raw: string;

	constructor(
		message: string,
		options: {
			provider: AiProviderName;
			model: string;
			raw: string;
			problems: string[];
			cause?: unknown;
		}
	) {
		super(message, { ...options, code: 'check' });

		this.name = 'AiCheckError';
		this.problems = options.problems;
		this.raw = options.raw;
	}
}

export class AiExhaustedError extends AiError {
	readonly attempts: AiAttempt[];

	constructor(message: string, attempts: AiAttempt[], cause?: unknown) {
		super(message, { code: 'exhausted', cause });

		this.name = 'AiExhaustedError';
		this.attempts = attempts;
	}
}

/** Invalid JSON, schema mismatches, and failed semantic checks can be repaired. */
export function isRepairableAiError(error: AiError): boolean {
	return error.code === 'invalid_json' || error.code === 'schema' || error.code === 'check';
}

/** Everything except an explicit abort is worth trying on the next model. */
export function isFallbackEligible(error: AiError): boolean {
	return error.code !== 'aborted';
}

export function problemsOf(error: AiError): string[] {
	if (error instanceof AiSchemaError || error instanceof AiCheckError) return error.problems;

	return [error.message];
}

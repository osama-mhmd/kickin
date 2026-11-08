import type { AiProviderName } from '#lib/ai/types.ts';
import {
	AiAbortedError,
	AiInvalidResponseError,
	AiProviderError,
	AiRateLimitError,
	AiTimeoutError
} from '../errors';
import type { AiFetch } from '../types';

export interface PostJsonOptions {
	provider: AiProviderName;
	model: string;
	url: string;
	body: unknown;
	headers?: HeadersInit;
	timeoutMs: number;
	fetch: AiFetch;
	signal?: AbortSignal;
}

export async function postJson(options: PostJsonOptions): Promise<unknown> {
	if (options.signal?.aborted) {
		throw new AiAbortedError('AI request was aborted before it started.', options);
	}

	const controller = new AbortController();
	const externalSignal = options.signal;
	let timedOut = false;
	const onExternalAbort = () => controller.abort(externalSignal?.reason);
	const timeout = setTimeout(() => {
		timedOut = true;
		controller.abort();
	}, options.timeoutMs);

	if (externalSignal) {
		externalSignal.addEventListener('abort', onExternalAbort, { once: true });
	}

	const headers = new Headers(options.headers);
	headers.set('content-type', 'application/json');

	let response: Response;

	try {
		response = await options.fetch(options.url, {
			method: 'POST',
			headers,
			body: JSON.stringify(options.body),
			signal: controller.signal
		});
	} catch (cause) {
		if (timedOut) {
			throw new AiTimeoutError(`AI provider request timed out after ${options.timeoutMs}ms.`, {
				...options,
				cause
			});
		}

		if (externalSignal?.aborted) {
			throw new AiAbortedError('AI request was aborted.', options);
		}

		throw new AiProviderError('AI provider request failed.', {
			provider: options.provider,
			model: options.model,
			code: 'network',
			cause
		});
	} finally {
		clearTimeout(timeout);
		externalSignal?.removeEventListener('abort', onExternalAbort);
	}

	const text = await response.text();

	if (!response.ok) {
		throw toHttpError(response, text, options);
	}

	if (text.trim().length === 0) {
		throw new AiInvalidResponseError('AI provider returned an empty response.', {
			provider: options.provider,
			model: options.model,
			status: response.status
		});
	}

	try {
		return JSON.parse(text) as unknown;
	} catch (cause) {
		throw new AiInvalidResponseError('AI provider returned a malformed response.', {
			provider: options.provider,
			model: options.model,
			status: response.status,
			details: text.slice(0, 2_000),
			cause
		});
	}
}

function toHttpError(response: Response, text: string, options: PostJsonOptions): AiProviderError {
	const details = parseDetails(text);
	const message =
		extractMessage(details) ?? `AI provider request failed with status ${response.status}.`;
	const remaining = toInteger(response.headers.get('x-ratelimit-remaining'));
	const isRateLimit =
		response.status === 429 ||
		(response.status === 403 && (remaining === 0 || /rate limit/i.test(message)));

	if (isRateLimit) {
		return new AiRateLimitError(message, {
			provider: options.provider,
			model: options.model,
			status: response.status,
			details,
			resetAt: parseResetAt(response.headers)
		});
	}

	return new AiProviderError(message, {
		provider: options.provider,
		model: options.model,
		status: response.status,
		details
	});
}

function parseDetails(text: string): unknown {
	if (text.trim().length === 0) return undefined;

	try {
		return JSON.parse(text) as unknown;
	} catch {
		return text.slice(0, 2_000);
	}
}

function extractMessage(details: unknown): string | undefined {
	if (typeof details === 'string' && details.length > 0) return details;

	if (typeof details === 'object' && details !== null) {
		if ('message' in details && typeof details.message === 'string') return details.message;

		if (
			'error' in details &&
			typeof details.error === 'object' &&
			details.error !== null &&
			'message' in details.error &&
			typeof details.error.message === 'string'
		) {
			return details.error.message;
		}
	}

	return undefined;
}

function parseResetAt(headers: Headers): Date | null {
	const retryAfter = toInteger(headers.get('retry-after'));

	if (retryAfter !== null) return new Date(Date.now() + retryAfter * 1_000);

	const reset = toInteger(headers.get('x-ratelimit-reset'));

	return reset === null ? null : new Date(reset * 1_000);
}

function toInteger(value: string | null): number | null {
	if (value === null) return null;

	const parsed = Number(value);

	return Number.isFinite(parsed) ? parsed : null;
}

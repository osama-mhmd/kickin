import { config } from '../../config';
import {
	GitHubApiError,
	GitHubConfigurationError,
	GitHubError,
	GitHubNetworkError,
	GitHubRateLimitError
} from './errors';
import type {
	GitHubClientOptions,
	GitHubFetch,
	GitHubJsonResponse,
	GitHubQuery,
	GitHubRequestOptions
} from './types';

const DEFAULT_BASE_URL = 'https://api.github.com';
const DEFAULT_API_VERSION = '2022-11-28';
const DEFAULT_TIMEOUT_MS = 30_000;

export class GitHubClient {
	private readonly token: string;
	private readonly baseUrl: string;
	private readonly userAgent: string;
	private readonly apiVersion: string;
	private readonly timeoutMs: number;
	private readonly fetchImpl: GitHubFetch;

	constructor(options: GitHubClientOptions = {}) {
		const token = options.token ?? config.githubToken;

		if (!token) {
			throw new GitHubConfigurationError(
				'GITHUB_TOKEN is not set. Add it to the environment before using the GitHub module.'
			);
		}

		this.token = token;
		this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
		this.userAgent = options.userAgent ?? 'kickin';
		this.apiVersion = options.apiVersion ?? DEFAULT_API_VERSION;
		this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
		this.fetchImpl = options.fetch ?? ((input, init) => fetch(input, init));
	}

	async request(path: string, options: GitHubRequestOptions = {}): Promise<Response> {
		const url = this.buildUrl(path, options.query);
		const headers = new Headers(options.headers);

		headers.set('Authorization', `Bearer ${this.token}`);
		headers.set('Accept', options.accept ?? 'application/vnd.github+json');
		headers.set('X-GitHub-Api-Version', this.apiVersion);
		headers.set('User-Agent', this.userAgent);

		let body: BodyInit | undefined;

		if (options.body !== undefined) {
			headers.set('Content-Type', 'application/json');
			body = JSON.stringify(options.body);
		}

		const response = await this.send(url, {
			method: options.method ?? 'GET',
			headers,
			body,
			signal: options.signal,
			redirect: options.redirect ?? 'follow'
		});

		if (!response.ok) {
			throw await toApiError(response, url);
		}

		return response;
	}

	async requestJson<T>(path: string, options: GitHubRequestOptions = {}): Promise<T> {
		const { data } = await this.requestJsonWithMeta<T>(path, options);

		return data;
	}

	async requestJsonWithMeta<T>(
		path: string,
		options: GitHubRequestOptions = {}
	): Promise<GitHubJsonResponse<T>> {
		const response = await this.request(path, options);
		const text = await response.text();

		let data: T;

		if (text.length === 0) {
			data = undefined as T;
		} else {
			try {
				data = JSON.parse(text) as T;
			} catch (cause) {
				throw new GitHubError('GitHub returned a response that is not valid JSON.', {
					code: 'http',
					status: response.status,
					requestUrl: response.url,
					cause
				});
			}
		}

		return {
			data,
			headers: response.headers,
			status: response.status,
			url: response.url
		};
	}

	protected buildUrl(path: string, query?: GitHubQuery): string {
		const url = new URL(
			path.startsWith('http') ? path : `${this.baseUrl}${path.startsWith('/') ? path : `/${path}`}`
		);

		if (!query) return url.toString();

		for (const [key, value] of Object.entries(query)) {
			const values = Array.isArray(value) ? value : [value];

			for (const item of values) {
				if (item === undefined || item === null || item === '') continue;

				url.searchParams.append(key, String(item));
			}
		}

		return url.toString();
	}

	private async send(url: string, init: RequestInit): Promise<Response> {
		const controller = new AbortController();
		const externalSignal = init.signal;
		const onExternalAbort = () => controller.abort(externalSignal?.reason);
		const timeout = setTimeout(() => {
			controller.abort(
				new GitHubNetworkError(`GitHub request timed out after ${this.timeoutMs}ms.`, {
					requestUrl: url
				})
			);
		}, this.timeoutMs);

		if (externalSignal) {
			if (externalSignal.aborted) {
				controller.abort(externalSignal.reason);
			} else {
				externalSignal.addEventListener('abort', onExternalAbort, { once: true });
			}
		}

		try {
			return await this.fetchImpl(url, { ...init, signal: controller.signal });
		} catch (cause) {
			if (cause instanceof GitHubError) throw cause;

			throw new GitHubNetworkError('GitHub request failed.', { requestUrl: url, cause });
		} finally {
			clearTimeout(timeout);
			externalSignal?.removeEventListener('abort', onExternalAbort);
		}
	}
}

export function parseLinkHeader(header: string | null): Record<string, string> {
	if (!header) return {};

	const links: Record<string, string> = {};
	const parts = header.split(',');

	for (const part of parts) {
		const match = /<([^>]+)>\s*;\s*rel="([^"]+)"/.exec(part.trim());

		if (match) {
			links[match[2]] = match[1];
		}
	}

	return links;
}

async function toApiError(response: Response, url: string): Promise<GitHubError> {
	const details = await readErrorDetails(response);
	const message =
		extractErrorMessage(details) ?? `GitHub request failed with status ${response.status}.`;
	const rateLimit = parseRateLimit(response.headers);

	const isRateLimit =
		response.status === 429 ||
		(response.status === 403 && (rateLimit.remaining === 0 || /rate limit/i.test(message)));

	if (isRateLimit) {
		const resetMessage = rateLimit.resetAt
			? `${message} Rate limit resets at ${rateLimit.resetAt.toISOString()}.`
			: message;

		return new GitHubRateLimitError(resetMessage, {
			status: response.status,
			requestUrl: url,
			details,
			resetAt: rateLimit.resetAt,
			remaining: rateLimit.remaining,
			limit: rateLimit.limit
		});
	}

	return new GitHubApiError(message, { status: response.status, requestUrl: url, details });
}

async function readErrorDetails(response: Response): Promise<unknown> {
	const text = await response.text();

	if (text.length === 0) return undefined;

	try {
		return JSON.parse(text) as unknown;
	} catch {
		return text;
	}
}

function extractErrorMessage(details: unknown): string | undefined {
	if (typeof details === 'string' && details.length > 0) return details;

	if (typeof details === 'object' && details !== null && 'message' in details) {
		const message = details.message;

		if (typeof message === 'string' && message.length > 0) return message;
	}

	return undefined;
}

function parseRateLimit(headers: Headers): {
	resetAt: Date | null;
	remaining: number | null;
	limit: number | null;
} {
	const resetSeconds = toInteger(headers.get('x-ratelimit-reset'));

	return {
		resetAt: resetSeconds === null ? null : new Date(resetSeconds * 1000),
		remaining: toInteger(headers.get('x-ratelimit-remaining')),
		limit: toInteger(headers.get('x-ratelimit-limit'))
	};
}

function toInteger(value: string | null): number | null {
	if (value === null) return null;

	const parsed = Number(value);

	return Number.isInteger(parsed) ? parsed : null;
}

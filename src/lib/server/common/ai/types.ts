import type { ZodType } from 'zod';
import type { AiAttempt, AiEvent, AiProviderName } from '#lib/ai/types.ts';

export type AiFetch = (input: string, init?: RequestInit) => Promise<Response>;

/** One entry in the fallback chain. The chain is data, never hardcoded logic. */
export interface AiModelConfig {
	provider: AiProviderName;
	model: string;
	/** Requests-per-minute budget, used by queues to tune their rate limiter. */
	rpm?: number;
	maxTokens?: number;
	timeoutMs?: number;
}

export type AiRole = 'system' | 'user' | 'assistant';

export interface AiMessage {
	role: AiRole;
	content: string;
}

export interface AiUsage {
	inputTokens?: number;
	outputTokens?: number;
}

export interface AskOptions {
	/** The current user message. */
	message: string;
	/** Earlier turns, oldest first. System turns are allowed but unusual. */
	history?: AiMessage[];
	/** Rules/system instructions. A string or one string per rule. */
	rules?: string | string[];
	/** Override the configured fallback chain for this call. */
	models?: AiModelConfig[];
	temperature?: number;
	maxTokens?: number;
	timeoutMs?: number;
	signal?: AbortSignal;
	/** Called for every attempt, failure, repair, fallback, and terminal event. */
	onEvent?: (event: AiEvent) => void;
}

export interface AiCompletion {
	text: string;
	provider: AiProviderName;
	model: string;
	latencyMs: number;
	usage?: AiUsage;
	attempts: AiAttempt[];
}

export interface AiJsonCompletion<T> extends AiCompletion {
	value: T;
}

/**
 * A semantic check run after schema validation. Return a message (or several)
 * to reject the answer and ask the model to repair it.
 */
export type AiCheck<T> = (value: T) => string | readonly string[] | null | undefined | void;

export interface AskJsonOptions<T> extends AskOptions {
	/** The interface the JSON must satisfy. */
	schema: ZodType<T>;
	/** Extra honesty/business checks applied after the schema. */
	checks?: AiCheck<T> | readonly AiCheck<T>[];
	/** Append the built-in skeptical rules. Defaults to `true`. */
	honesty?: boolean;
	/** Repair attempts per model. Defaults to the client setting (1). */
	repairs?: number;
}

export interface AiClientOptions {
	/** Override the configured fallback chain. */
	chain?: AiModelConfig[];
	/**
	 * Provider keys. When omitted, keys are read from config. Passing an object
	 * uses exactly those keys, which makes tests and workers deterministic.
	 */
	apiKeys?: Partial<Record<AiProviderName, string>>;
	fetch?: AiFetch;
	timeoutMs?: number;
	temperature?: number;
	/** Repair attempts per model for `askJson`. Defaults to 1. */
	maxRepairAttempts?: number;
}

export interface ProviderRequest {
	provider: AiProviderName;
	model: string;
	apiKey: string;
	messages: AiMessage[];
	temperature: number;
	maxTokens?: number;
	timeoutMs: number;
	signal?: AbortSignal;
	fetch: AiFetch;
}

export interface ProviderResponse {
	text: string;
	usage?: AiUsage;
}

/**
 * Shared AI contract.
 *
 * These types are safe to import from the browser. The implementation lives in
 * `src/lib/server/common/ai` and must never be imported by UI code.
 */

export type AiProviderName = 'groq' | 'gemini' | 'openrouter';

export type AiErrorCode =
	| 'configuration'
	| 'validation'
	| 'network'
	| 'timeout'
	| 'rate_limit'
	| 'http'
	| 'invalid_response'
	| 'invalid_json'
	| 'schema'
	| 'check'
	| 'aborted'
	| 'exhausted';

export interface AiModelRef {
	provider: AiProviderName;
	model: string;
}

export interface AiAttempt extends AiModelRef {
	/** 1-based across the whole fallback chain, including repairs. */
	number: number;
	outcome: 'success' | 'failure';
	latencyMs: number;
	errorCode?: AiErrorCode;
	message?: string;
}

export interface AiAttemptEvent extends AiModelRef {
	type: 'attempt';
	number: number;
	phase: 'request' | 'repair';
}

export interface AiFailureEvent {
	type: 'failure';
	attempt: AiAttempt;
}

export interface AiRepairEvent extends AiModelRef {
	type: 'repair';
	attempt: number;
	problems: string[];
}

export interface AiFallbackEvent {
	type: 'fallback';
	reason: AiErrorCode;
	message: string;
	from: AiModelRef;
	to: AiModelRef;
}

export interface AiSuccessEvent {
	type: 'success';
	attempt: AiAttempt;
	/** Present for free-form `ask`. */
	text?: string;
	/** Present for `askJson`; already schema-validated. */
	value?: unknown;
}

export interface AiExhaustedEvent {
	type: 'exhausted';
	message: string;
	attempts: AiAttempt[];
}

/**
 * Events emitted while an AI call moves through the fallback chain. Yielded by
 * `streamAsk`/`streamAskJson` and turned into SSE by `createAiEventStream`.
 */
export type AiEvent =
	| AiAttemptEvent
	| AiFailureEvent
	| AiRepairEvent
	| AiFallbackEvent
	| AiSuccessEvent
	| AiExhaustedEvent;

export type AiEventType = AiEvent['type'];

export const AI_EVENT_TYPES = [
	'attempt',
	'failure',
	'repair',
	'fallback',
	'success',
	'exhausted'
] as const satisfies readonly AiEventType[];

export function isAiEventType(value: string): value is AiEventType {
	return (AI_EVENT_TYPES as readonly string[]).includes(value);
}

/** Event types after which the server closes the SSE stream. */
export function isTerminalAiEvent(type: AiEventType): boolean {
	return type === 'success' || type === 'exhausted';
}

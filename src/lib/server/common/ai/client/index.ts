import type { AiAttempt, AiEvent, AiModelRef, AiProviderName } from '#lib/ai/types.ts';
import { config } from '../../../config';
import { resolveAiChain } from '../chain';
import {
	AiAbortedError,
	AiCheckError,
	AiConfigurationError,
	AiError,
	AiExhaustedError,
	AiProviderError,
	AiSchemaError,
	AiValidationError,
	isRepairableAiError,
	problemsOf
} from '../errors';
import { parseStrictJson } from '../json';
import { HONESTY_RULES, JSON_CONTRACT, buildRepairPrompt } from '../prompt';
import { callProvider } from '../providers';
import type {
	AiCheck,
	AiClientOptions,
	AiCompletion,
	AiJsonCompletion,
	AiMessage,
	AiModelConfig,
	AskJsonOptions,
	AskOptions
} from '../types';

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_TEMPERATURE = 0;
const DEFAULT_MAX_REPAIR_ATTEMPTS = 1;

type AiParse<T> = (text: string, context: AiModelRef) => T;

interface RunSpec<T> {
	chain: AiModelConfig[];
	messages: AiMessage[];
	options: AskOptions;
	parse: AiParse<T> | null;
	repairLimit: number;
}

interface RunResult<T> extends AiCompletion {
	value: T;
}

/**
 * The AI common module's client. It owns the fallback chain, retries, strict
 * JSON validation, and the attempt lifecycle. It knows nothing about the
 * database, queues, or SvelteKit.
 */
export class AiClient {
	private readonly chain: AiModelConfig[];
	private readonly apiKeys: Partial<Record<AiProviderName, string>>;
	private readonly fetchImpl: (input: string, init?: RequestInit) => Promise<Response>;
	private readonly timeoutMs: number;
	private readonly temperature: number;
	private readonly maxRepairAttempts: number;

	constructor(options: AiClientOptions = {}) {
		this.chain = options.chain ?? resolveAiChain();
		this.apiKeys = options.apiKeys ?? {
			groq: config.groqApiKey,
			gemini: config.geminiApiKey,
			openrouter: config.openrouterApiKey
		};
		this.fetchImpl = options.fetch ?? ((input, init) => fetch(input, init));
		this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
		this.temperature = options.temperature ?? DEFAULT_TEMPERATURE;
		this.maxRepairAttempts = Math.max(0, options.maxRepairAttempts ?? DEFAULT_MAX_REPAIR_ATTEMPTS);
	}

	/** Free-form interaction: message + history + rules in, text out. */
	async ask(options: AskOptions): Promise<AiCompletion> {
		return collect(this.streamAsk(options), options.onEvent);
	}

	streamAsk(options: AskOptions): AsyncGenerator<AiEvent, AiCompletion> {
		return this.runStream(options);
	}

	/** JSON interaction: same as `ask`, with schema and honesty validation. */
	async askJson<T>(options: AskJsonOptions<T>): Promise<AiJsonCompletion<T>> {
		return collect(this.streamAskJson(options), options.onEvent);
	}

	streamAskJson<T>(options: AskJsonOptions<T>): AsyncGenerator<AiEvent, AiJsonCompletion<T>> {
		return this.runJsonStream(options);
	}

	private async *runStream(options: AskOptions): AsyncGenerator<AiEvent, AiCompletion> {
		validateAskOptions(options);
		const chain = this.resolveChain(options);
		const messages = buildMessages(options);

		const result = yield* this.run<string>({
			chain,
			messages,
			options,
			parse: null,
			repairLimit: 0
		});

		return result;
	}

	private async *runJsonStream<T>(
		options: AskJsonOptions<T>
	): AsyncGenerator<AiEvent, AiJsonCompletion<T>> {
		validateAskOptions(options);
		const chain = this.resolveChain(options);
		const extraRules = options.honesty === false ? [JSON_CONTRACT] : [HONESTY_RULES, JSON_CONTRACT];
		const messages = buildMessages(options, extraRules);

		const result = yield* this.run<T>({
			chain,
			messages,
			options,
			parse: (text, context) => validateJson(text, options, context),
			repairLimit: Math.max(0, options.repairs ?? this.maxRepairAttempts)
		});

		return result;
	}

	private async *run<T>(spec: RunSpec<T>): AsyncGenerator<AiEvent, RunResult<T>> {
		const attempts: AiAttempt[] = [];
		let attemptNumber = 0;
		let lastError: AiError | undefined;

		for (let index = 0; index < spec.chain.length; index += 1) {
			const entry = spec.chain[index];
			const next = spec.chain[index + 1];
			const apiKey = this.apiKeys[entry.provider];

			if (!apiKey) {
				attemptNumber += 1;

				const error = new AiConfigurationError(`No API key is configured for ${entry.provider}.`, {
					provider: entry.provider,
					model: entry.model
				});
				const attempt = failureAttempt(attemptNumber, entry, 0, error);

				attempts.push(attempt);
				lastError = error;

				yield { type: 'failure', attempt };

				if (next) yield fallbackEvent(entry, next, error);

				continue;
			}

			let messages = spec.messages;

			for (let repair = 0; repair <= spec.repairLimit; repair += 1) {
				attemptNumber += 1;

				yield {
					type: 'attempt',
					number: attemptNumber,
					provider: entry.provider,
					model: entry.model,
					phase: repair === 0 ? 'request' : 'repair'
				};

				const startedAt = Date.now();
				let responseText = '';

				try {
					const response = await callProvider({
						provider: entry.provider,
						model: entry.model,
						apiKey,
						messages,
						temperature: spec.options.temperature ?? this.temperature,
						maxTokens: entry.maxTokens ?? spec.options.maxTokens,
						timeoutMs: entry.timeoutMs ?? spec.options.timeoutMs ?? this.timeoutMs,
						signal: spec.options.signal,
						fetch: this.fetchImpl
					});

					responseText = response.text;

					const value = spec.parse
						? spec.parse(response.text, { provider: entry.provider, model: entry.model })
						: (response.text as T);
					const latencyMs = Date.now() - startedAt;
					const attempt: AiAttempt = {
						number: attemptNumber,
						provider: entry.provider,
						model: entry.model,
						outcome: 'success',
						latencyMs
					};

					attempts.push(attempt);

					yield { type: 'success', attempt };

					return {
						value,
						text: response.text,
						provider: entry.provider,
						model: entry.model,
						latencyMs,
						usage: response.usage,
						attempts
					};
				} catch (cause) {
					const error = asAiError(cause, entry);
					const latencyMs = Date.now() - startedAt;
					const attempt = failureAttempt(attemptNumber, entry, latencyMs, error);

					attempts.push(attempt);
					lastError = error;

					yield { type: 'failure', attempt };

					if (error.code === 'aborted') throw error;

					if (spec.parse && isRepairableAiError(error) && repair < spec.repairLimit) {
						const problems = problemsOf(error);

						yield {
							type: 'repair',
							attempt: attemptNumber,
							provider: entry.provider,
							model: entry.model,
							problems
						};

						messages = appendRepair(messages, responseText, problems);

						continue;
					}

					break;
				}
			}

			if (next && lastError) yield fallbackEvent(entry, next, lastError);
		}

		const message = lastError
			? `All AI models failed. Last error: ${lastError.message}`
			: 'All AI models failed.';
		const exhausted = new AiExhaustedError(message, attempts, lastError);

		yield { type: 'exhausted', message, attempts };

		throw exhausted;
	}

	private resolveChain(options: AskOptions): AiModelConfig[] {
		const chain = options.models ?? this.chain;

		if (!Array.isArray(chain) || chain.length === 0) {
			throw new AiConfigurationError('AI fallback chain is empty.');
		}

		return chain;
	}
}

async function collect<T>(
	events: AsyncGenerator<AiEvent, T>,
	onEvent?: (event: AiEvent) => void
): Promise<T> {
	while (true) {
		const next = await events.next();

		if (next.done) return next.value;

		onEvent?.(next.value);
	}
}

function validateAskOptions(options: AskOptions): void {
	if (typeof options.message !== 'string' || options.message.trim().length === 0) {
		throw new AiValidationError('"message" must be a non-empty string.');
	}

	if (options.history !== undefined) {
		if (!Array.isArray(options.history)) {
			throw new AiValidationError('"history" must be an array of messages.');
		}

		for (const message of options.history) {
			if (
				typeof message !== 'object' ||
				message === null ||
				(message.role !== 'system' && message.role !== 'user' && message.role !== 'assistant') ||
				typeof message.content !== 'string' ||
				message.content.trim().length === 0
			) {
				throw new AiValidationError(
					'Each history message needs a valid role and non-empty content.'
				);
			}
		}
	}

	if (options.rules !== undefined) normalizeRules(options.rules);

	if (
		options.temperature !== undefined &&
		(typeof options.temperature !== 'number' ||
			!Number.isFinite(options.temperature) ||
			options.temperature < 0 ||
			options.temperature > 2)
	) {
		throw new AiValidationError('"temperature" must be a number between 0 and 2.');
	}

	if (
		options.maxTokens !== undefined &&
		(typeof options.maxTokens !== 'number' ||
			!Number.isInteger(options.maxTokens) ||
			options.maxTokens <= 0)
	) {
		throw new AiValidationError('"maxTokens" must be a positive integer.');
	}

	if (
		options.timeoutMs !== undefined &&
		(typeof options.timeoutMs !== 'number' ||
			!Number.isInteger(options.timeoutMs) ||
			options.timeoutMs <= 0)
	) {
		throw new AiValidationError('"timeoutMs" must be a positive integer.');
	}
}

function normalizeRules(rules: AskOptions['rules']): string[] {
	if (rules === undefined) return [];

	const list = Array.isArray(rules) ? rules : [rules];
	const normalized: string[] = [];

	for (const rule of list) {
		if (typeof rule !== 'string' || rule.trim().length === 0) {
			throw new AiValidationError('Each rule must be a non-empty string.');
		}

		normalized.push(rule.trim());
	}

	return normalized;
}

function buildMessages(options: AskOptions, extraRules: readonly string[] = []): AiMessage[] {
	const rules = [...normalizeRules(options.rules), ...extraRules];
	const messages: AiMessage[] = [];

	if (rules.length > 0) {
		messages.push({ role: 'system', content: rules.join('\n\n') });
	}

	for (const message of options.history ?? []) {
		messages.push({ role: message.role, content: message.content });
	}

	messages.push({ role: 'user', content: options.message });

	return messages;
}

function validateJson<T>(text: string, options: AskJsonOptions<T>, context: AiModelRef): T {
	const value = parseStrictJson(text, context);
	const parsed = options.schema.safeParse(value);

	if (!parsed.success) {
		throw new AiSchemaError('The AI response does not match the required schema.', {
			...context,
			raw: text,
			problems: formatIssues(parsed.error.issues)
		});
	}

	const problems = runChecks(parsed.data, options.checks);

	if (problems.length > 0) {
		throw new AiCheckError('The AI response failed semantic checks.', {
			...context,
			raw: text,
			problems
		});
	}

	return parsed.data;
}

function formatIssues(
	issues: readonly { path: readonly PropertyKey[]; message: string }[]
): string[] {
	return issues.map((issue) => {
		const path = issue.path.map(String).join('.');

		return `${path.length > 0 ? path : '(root)'}: ${issue.message}`;
	});
}

function runChecks<T>(value: T, checks: AskJsonOptions<T>['checks']): string[] {
	const list: readonly AiCheck<T>[] = typeof checks === 'function' ? [checks] : (checks ?? []);
	const problems: string[] = [];

	for (const check of list) {
		const result = check(value);

		if (result === undefined || result === null) continue;

		if (typeof result === 'string') {
			if (result.trim().length > 0) problems.push(result.trim());

			continue;
		}

		for (const problem of result) {
			if (problem.trim().length > 0) problems.push(problem.trim());
		}
	}

	return problems;
}

function failureAttempt(
	number: number,
	entry: AiModelConfig,
	latencyMs: number,
	error: AiError
): AiAttempt {
	return {
		number,
		provider: entry.provider,
		model: entry.model,
		outcome: 'failure',
		latencyMs,
		errorCode: error.code,
		message: error.message
	};
}

function fallbackEvent(from: AiModelConfig, to: AiModelConfig, error: AiError): AiEvent {
	return {
		type: 'fallback',
		reason: error.code,
		message: error.message,
		from: { provider: from.provider, model: from.model },
		to: { provider: to.provider, model: to.model }
	};
}

function appendRepair(
	messages: readonly AiMessage[],
	raw: string,
	problems: readonly string[]
): AiMessage[] {
	const next = [...messages];

	if (raw.trim().length > 0) {
		next.push({ role: 'assistant', content: raw });
	}

	next.push({ role: 'user', content: buildRepairPrompt(problems) });

	return next;
}

function asAiError(cause: unknown, entry: AiModelConfig): AiError {
	if (cause instanceof AiError) return cause;

	if (cause instanceof Error && cause.name === 'AbortError') {
		return new AiAbortedError('AI request was aborted.', {
			provider: entry.provider,
			model: entry.model
		});
	}

	return new AiProviderError(cause instanceof Error ? cause.message : String(cause), {
		provider: entry.provider,
		model: entry.model,
		code: 'network',
		cause
	});
}

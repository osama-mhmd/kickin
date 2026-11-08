import { AiClient } from './client';
import type { AiClientOptions } from './types';

export * from '#lib/ai/types.ts';
export * from './types';
export * from './errors';
export { AiClient } from './client';
export { defaultAiChain, parseAiChain, resolveAiChain } from './chain';
export { HONESTY_RULES, JSON_CONTRACT, AI_PROMPT_VERSION } from './prompt';
export { createAiEventStream, formatAiEvent } from './sse';
export {
	callGemini,
	callOpenAiCompatible,
	callProvider,
	postJson,
	GEMINI_BASE_URL,
	GROQ_BASE_URL,
	OPENROUTER_BASE_URL
} from './providers';

export function createAiModule(options: AiClientOptions = {}): AiClient {
	return new AiClient(options);
}

let defaultModule: AiClient | undefined;

/** Shared process-wide module. Reads keys and the fallback chain lazily. */
export function getAiModule(): AiClient {
	defaultModule ??= createAiModule();

	return defaultModule;
}

/** Replace the shared module. Intended for tests and worker bootstrap. */
export function setAiModule(module: AiClient | undefined): void {
	defaultModule = module;
}

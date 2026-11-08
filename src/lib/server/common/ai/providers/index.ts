import { AiConfigurationError } from '../errors';
import type { ProviderRequest, ProviderResponse } from '../types';
import { callGemini } from './gemini';
import { GROQ_BASE_URL, OPENROUTER_BASE_URL, callOpenAiCompatible } from './openai-compatible';

export { callGemini, GEMINI_BASE_URL } from './gemini';
export { callOpenAiCompatible, GROQ_BASE_URL, OPENROUTER_BASE_URL } from './openai-compatible';
export { postJson } from './transport';

export function callProvider(request: ProviderRequest): Promise<ProviderResponse> {
	switch (request.provider) {
		case 'groq':
			return callOpenAiCompatible(request, GROQ_BASE_URL);
		case 'openrouter':
			return callOpenAiCompatible(request, OPENROUTER_BASE_URL);
		case 'gemini':
			return callGemini(request);
		default: {
			const unreachable: never = request.provider;

			throw new AiConfigurationError(`Unknown AI provider "${String(unreachable)}".`);
		}
	}
}

import type { AiProviderName } from '#lib/ai/types.ts';
import { AiInvalidJsonError } from './errors';

const FENCED_JSON = /^```(?:json)?[ \t]*\r?\n([\s\S]*?)\r?\n?```$/i;

export interface JsonContext {
	provider: AiProviderName;
	model: string;
}

/**
 * Strip a single markdown JSON fence. Strict JSON is still required: prose
 * around the JSON is not accepted, because that would be unvalidated model
 * text leaking into the pipeline.
 */
export function unwrapJsonText(text: string): string {
	const trimmed = text.trim();
	const match = FENCED_JSON.exec(trimmed);

	return match ? match[1].trim() : trimmed;
}

export function parseStrictJson(text: string, context: JsonContext): unknown {
	const candidate = unwrapJsonText(text);

	if (candidate.length === 0) {
		throw new AiInvalidJsonError('The model returned an empty response instead of JSON.', {
			...context,
			raw: text
		});
	}

	try {
		return JSON.parse(candidate) as unknown;
	} catch (cause) {
		throw new AiInvalidJsonError('The model returned text that is not valid JSON.', {
			...context,
			raw: text,
			cause
		});
	}
}

import { describe, expect, test } from 'vitest';
import { AiInvalidJsonError } from './errors';
import { parseStrictJson, unwrapJsonText } from './json';

const CONTEXT = { provider: 'groq' as const, model: 'model-test' };

describe('unwrapJsonText', () => {
	test('unwraps one optional markdown fence', () => {
		expect(unwrapJsonText('```json\n{"a":1}\n```')).toBe('{"a":1}');
		expect(unwrapJsonText('```\n{"a":1}\n```')).toBe('{"a":1}');
		expect(unwrapJsonText('  {"a":1}  ')).toBe('{"a":1}');
	});
});

describe('parseStrictJson', () => {
	test('parses JSON and rejects prose', () => {
		expect(parseStrictJson('{"a":1}', CONTEXT)).toEqual({ a: 1 });
		expect(() => parseStrictJson('The answer is {"a":1}', CONTEXT)).toThrow(AiInvalidJsonError);
		expect(() => parseStrictJson('', CONTEXT)).toThrow(AiInvalidJsonError);
	});

	test('includes the raw response on the typed error', () => {
		const error = (() => {
			try {
				parseStrictJson('not json', CONTEXT);
			} catch (cause) {
				return cause;
			}
		})();

		expect(error).toBeInstanceOf(AiInvalidJsonError);
		expect((error as AiInvalidJsonError).raw).toBe('not json');
		expect((error as AiInvalidJsonError).provider).toBe('groq');
	});
});

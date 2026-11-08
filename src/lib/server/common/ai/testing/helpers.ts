import type { AiFetch } from '../types';

export interface RecordedCall {
	url: string;
	init: RequestInit | undefined;
	body: unknown;
}

export interface RecordingFetch {
	fetch: AiFetch;
	calls: RecordedCall[];
}

export function jsonResponse(
	body: unknown,
	options: { status?: number; headers?: HeadersInit } = {}
): Response {
	return new Response(JSON.stringify(body), {
		status: options.status ?? 200,
		headers: { 'content-type': 'application/json', ...options.headers }
	});
}

export function openAiText(text: string): unknown {
	return {
		choices: [{ message: { content: text } }],
		usage: { prompt_tokens: 10, completion_tokens: 5 }
	};
}

export function geminiText(text: string): unknown {
	return {
		candidates: [{ content: { parts: [{ text }] } }],
		usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 }
	};
}

/** A fetch double that records every call and delegates the response. */
export function recordingFetch(
	handler: (call: RecordedCall, index: number) => Response | Promise<Response>
): RecordingFetch {
	const calls: RecordedCall[] = [];

	const fetchImpl: AiFetch = async (url, init) => {
		const body = typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined;
		const call: RecordedCall = { url, init, body };

		calls.push(call);

		return handler(call, calls.length - 1);
	};

	return { fetch: fetchImpl, calls };
}

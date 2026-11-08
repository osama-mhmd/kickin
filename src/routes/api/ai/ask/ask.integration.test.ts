import {
	createServer,
	type IncomingHttpHeaders,
	type IncomingMessage,
	type Server,
	type ServerResponse
} from 'node:http';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { requestAiEvents } from '#lib/ai/events.ts';
import type { AiEvent } from '#lib/ai/types.ts';
import { AiClient, setAiModule, type AiClientOptions } from '#lib/server/common/ai/index.ts';
import { POST } from './+server';

const TEXT = 'pong';

type FetchImpl = NonNullable<AiClientOptions['fetch']>;

function fakeClient(fetchImpl: FetchImpl): AiClient {
	return new AiClient({
		chain: [{ provider: 'groq', model: 'test-model' }],
		apiKeys: { groq: 'test-key' },
		fetch: fetchImpl
	});
}

function chatResponse(content: string): Response {
	return new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
		status: 200,
		headers: { 'content-type': 'application/json' }
	});
}

function failureResponse(): Response {
	return new Response(JSON.stringify({ error: { message: 'upstream down' } }), {
		status: 500,
		headers: { 'content-type': 'application/json' }
	});
}

function toHeaders(headers: IncomingHttpHeaders): Headers {
	const result = new Headers();

	for (const [key, value] of Object.entries(headers)) {
		if (value === undefined) continue;

		result.set(key, Array.isArray(value) ? value.join(', ') : value);
	}

	return result;
}

function responseHeaders(headers: Headers): Record<string, string> {
	const result: Record<string, string> = {};

	headers.forEach((value, key) => {
		result[key] = value;
	});

	return result;
}

async function readBody(request: IncomingMessage): Promise<string> {
	const chunks: Buffer[] = [];

	for await (const chunk of request) {
		chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
	}

	return Buffer.concat(chunks).toString('utf8');
}

async function handleRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
	const origin = `http://${request.headers.host ?? '127.0.0.1'}`;
	const url = new URL(request.url ?? '/', origin);

	if (url.pathname !== '/api/ai/ask') {
		response.writeHead(404);
		response.end('not found');

		return;
	}

	const abort = new AbortController();

	response.on('close', () => abort.abort());

	const eventRequest = new Request(url, {
		method: request.method,
		headers: toHeaders(request.headers),
		body: await readBody(request),
		signal: abort.signal
	});
	const event = await POST({
		request: eventRequest,
		url
	} as unknown as Parameters<typeof POST>[0]);

	response.writeHead(event.status, responseHeaders(event.headers));
	response.flushHeaders();

	if (!event.body) {
		response.end();

		return;
	}

	const reader = event.body.getReader();

	response.on('close', () => {
		void reader.cancel().catch(() => {});
	});

	while (true) {
		const { done, value } = await reader.read();

		if (done) break;

		response.write(value);
	}

	response.end();
}

function startServer(): Promise<Server> {
	return new Promise((resolve, reject) => {
		const server = createServer((request, response) => {
			void handleRequest(request, response).catch((error: unknown) => {
				if (!response.headersSent) response.writeHead(500);
				response.end(error instanceof Error ? error.message : String(error));
			});
		});

		server.once('error', reject);
		server.listen(0, '127.0.0.1', () => {
			server.off('error', reject);
			resolve(server);
		});
	});
}

function stopServer(server: Server): Promise<void> {
	return new Promise((resolve, reject) => {
		server.closeAllConnections();
		server.close((error) => (error ? reject(error) : resolve()));
	});
}

function serverUrl(server: Server): string {
	const address = server.address();

	if (!address || typeof address === 'string') {
		throw new Error('Test server did not bind to a TCP port.');
	}

	return `http://127.0.0.1:${address.port}`;
}

describe('POST /api/ai/ask over a real HTTP SSE connection', () => {
	let server: Server;
	let baseUrl: string;

	beforeEach(async () => {
		server = await startServer();
		baseUrl = serverUrl(server);
	});

	afterEach(async () => {
		setAiModule(undefined);
		await stopServer(server);
	});

	test('streams attempt and success events with the answer text', async () => {
		setAiModule(fakeClient(async () => chatResponse(TEXT)));

		const events: AiEvent[] = [];

		await requestAiEvents(
			`${baseUrl}/api/ai/ask`,
			{ message: 'ping', rules: 'Reply with pong.', history: [] },
			{ onEvent: (event) => events.push(event) }
		);

		expect(events.map((event) => event.type)).toEqual(['attempt', 'success']);
		expect(events.at(-1)).toMatchObject({
			type: 'success',
			text: TEXT,
			attempt: { provider: 'groq', model: 'test-model', outcome: 'success' }
		});
	});

	test('streams fallback events when the first model fails', async () => {
		let calls = 0;

		setAiModule(
			new AiClient({
				chain: [
					{ provider: 'groq', model: 'first' },
					{ provider: 'openrouter', model: 'second' }
				],
				apiKeys: { groq: 'key', openrouter: 'key' },
				fetch: async () => {
					calls += 1;

					return calls === 1 ? failureResponse() : chatResponse(TEXT);
				}
			})
		);

		const events: AiEvent[] = [];

		await requestAiEvents(
			`${baseUrl}/api/ai/ask`,
			{ message: 'ping' },
			{ onEvent: (event) => events.push(event) }
		);

		expect(events.map((event) => event.type)).toEqual([
			'attempt',
			'failure',
			'fallback',
			'attempt',
			'success'
		]);
		expect(events.at(-1)).toMatchObject({ type: 'success', text: TEXT });
	});

	test('returns the validated value for format: json', async () => {
		setAiModule(fakeClient(async () => chatResponse('{"answer":"pong"}')));

		const events: AiEvent[] = [];

		await requestAiEvents(
			`${baseUrl}/api/ai/ask`,
			{ message: 'ping', format: 'json' },
			{ onEvent: (event) => events.push(event) }
		);

		expect(events.at(-1)).toMatchObject({
			type: 'success',
			value: { answer: 'pong' }
		});
	});

	test('rejects invalid input before opening the stream', async () => {
		const response = await fetch(`${baseUrl}/api/ai/ask`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ message: '   ' })
		});

		expect(response.status).toBe(400);
		expect(await response.json()).toMatchObject({ error: 'Invalid AI request.' });
	});

	test('rejects malformed JSON bodies', async () => {
		const response = await fetch(`${baseUrl}/api/ai/ask`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: '{'
		});

		expect(response.status).toBe(400);
		expect(await response.json()).toMatchObject({ error: 'Body must be valid JSON.' });
	});
});

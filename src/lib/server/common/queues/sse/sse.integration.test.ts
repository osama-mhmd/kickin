import {
	createServer,
	type IncomingHttpHeaders,
	type IncomingMessage,
	type Server,
	type ServerResponse
} from 'node:http';
import { EventSource } from 'eventsource';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { jobEventsUrl, watchJobEvents, type JobEventSubscription } from '#lib/queues/job-events.ts';
import {
	isTerminalJobEvent,
	type JobEvent,
	type JobProgress,
	type JobState
} from '#lib/queues/types.ts';
import { GET as eventsHandler } from '../../../../../routes/api/queues/[queue]/jobs/[jobId]/events/+server';
import {
	closeQueueModule,
	createQueueModule,
	setQueueModule,
	type QueueClient,
	type QueueJob
} from '../index';

const QUEUE = 'ai-analysis';
const JOB_ID = 'analysis.1.contributor.user-7.1';
const JOB_DATA = { issueId: 1, userId: 7, mode: 'contributor', pass: 1 } as const;
const CONNECTION = { url: 'redis://localhost:6379' };

interface ScriptedJobOptions {
	state: JobState;
	progress?: JobProgress;
	result?: unknown;
}

function scriptedJob(options: ScriptedJobOptions): QueueJob {
	return {
		id: JOB_ID,
		name: 'analyze',
		data: JOB_DATA,
		progress: options.progress ?? null,
		attemptsMade: 0,
		returnvalue: options.result ?? null,
		failedReason: '',
		timestamp: 1_000,
		processedOn: 2_000,
		finishedOn: options.state === 'completed' ? 3_000 : undefined,
		getState: async () => options.state
	};
}

/**
 * Each `getJob` call returns the next scripted job. The route checks the job
 * once before opening the stream, then `watchJob` polls it.
 */
function scriptedQueue(script: QueueJob[]): QueueClient {
	let calls = 0;

	return {
		async add() {
			throw new Error('add is not expected in this integration test');
		},
		async getJob() {
			const job = script[Math.min(calls, script.length - 1)];

			calls += 1;

			return job;
		},
		async remove() {
			return 1;
		},
		async close() {}
	};
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

async function handleRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
	const origin = `http://${request.headers.host ?? '127.0.0.1'}`;
	const url = new URL(request.url ?? '/', origin);
	const match = /^\/api\/queues\/([^/]+)\/jobs\/([^/]+)\/events$/.exec(url.pathname);

	if (!match) {
		response.writeHead(404);
		response.end('not found');

		return;
	}

	const abort = new AbortController();

	response.on('close', () => abort.abort());

	const eventRequest = new Request(url, {
		method: request.method,
		headers: toHeaders(request.headers),
		signal: abort.signal
	});
	const event = await eventsHandler({
		params: {
			queue: decodeURIComponent(match[1]),
			jobId: decodeURIComponent(match[2])
		},
		request: eventRequest,
		url
	} as unknown as Parameters<typeof eventsHandler>[0]);

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

describe('job events over a real HTTP SSE connection', () => {
	let server: Server;
	let baseUrl: string;
	let subscription: JobEventSubscription | undefined;
	let globalValues: { EventSource?: unknown; document?: unknown } = {};

	beforeEach(async () => {
		const queue = scriptedQueue([
			scriptedJob({ state: 'active', progress: 0 }),
			scriptedJob({ state: 'active', progress: 0 }),
			scriptedJob({ state: 'active', progress: 25 }),
			scriptedJob({ state: 'active', progress: 100 }),
			scriptedJob({ state: 'completed', progress: 100, result: { ok: true } })
		]);
		const module = createQueueModule({
			connection: CONNECTION,
			queueFactory: () => queue,
			pollIntervalMs: 5
		});

		setQueueModule(module);
		server = await startServer();
		baseUrl = serverUrl(server);

		const mutableGlobal = globalThis as unknown as Record<string, unknown>;

		globalValues = {
			EventSource: mutableGlobal.EventSource,
			document: mutableGlobal.document
		};
		mutableGlobal.EventSource = EventSource;
		mutableGlobal.document = { baseURI: baseUrl };
	});

	afterEach(async () => {
		subscription?.close();
		subscription = undefined;
		await stopServer(server);
		await closeQueueModule();

		const mutableGlobal = globalThis as unknown as Record<string, unknown>;

		if (globalValues.EventSource === undefined) delete mutableGlobal.EventSource;
		else mutableGlobal.EventSource = globalValues.EventSource;

		if (globalValues.document === undefined) delete mutableGlobal.document;
		else mutableGlobal.document = globalValues.document;
	});

	test('streams snapshot, progress and completion events from the route', async () => {
		const received: JobEvent[] = [];
		let opened = false;

		const terminal = new Promise<JobEvent[]>((resolve, reject) => {
			const timer = setTimeout(() => {
				reject(
					new Error(
						`Timed out waiting for a terminal event. Received: ${received
							.map((event) => event.type)
							.join(', ')}`
					)
				);
			}, 5_000);

			subscription = watchJobEvents(QUEUE, JOB_ID, {
				onOpen() {
					opened = true;
				},
				onEvent(event) {
					received.push(event);

					if (isTerminalJobEvent(event.type)) {
						clearTimeout(timer);
						resolve(received);
					}
				},
				onTransportError(event) {
					clearTimeout(timer);
					reject(new Error(`SSE transport error before a terminal event: ${String(event.type)}`));
				}
			});
		});

		const terminalEvents = await terminal;

		expect(opened).toBe(true);
		expect(subscription?.source.url).toBe(`${baseUrl}${jobEventsUrl(QUEUE, JOB_ID)}`);
		expect(terminalEvents.map((event) => event.type)).toEqual([
			'snapshot',
			'progress',
			'progress',
			'completed'
		]);
		expect(terminalEvents.map((event) => event.progress)).toEqual([0, 25, 100, 100]);
		expect(terminalEvents.at(-1)).toMatchObject({
			id: JOB_ID,
			queue: QUEUE,
			state: 'completed',
			result: { ok: true }
		});
	});
});

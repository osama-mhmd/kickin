import type { JobEvent } from '#lib/queues/types.ts';

export interface JobEventStreamOptions {
	/** Keep-alive comment interval. Defaults to 15s. */
	heartbeatMs?: number;
	/** Reconnection delay advertised to EventSource. Defaults to 3s. */
	retryMs?: number;
	/** Aborts the stream when the HTTP request is cancelled. */
	signal?: AbortSignal;
}

const encoder = new TextEncoder();

/**
 * Turn a job event async iterable into a `text/event-stream` body.
 *
 * The stream sends an initial comment, heartbeats while idle, and one named SSE
 * event per job event. It closes after the iterator finishes (terminal job
 * state), which is why the client helper must close its EventSource on terminal
 * events instead of letting the browser reconnect forever.
 */
export function createJobEventStream(
	events: AsyncIterable<JobEvent>,
	options: JobEventStreamOptions = {}
): ReadableStream<Uint8Array> {
	const heartbeatMs = Math.max(1, options.heartbeatMs ?? 15_000);
	const retryMs = Math.max(0, options.retryMs ?? 3_000);
	let iterator: AsyncIterator<JobEvent> | undefined;
	let heartbeat: ReturnType<typeof setInterval> | undefined;
	let closed = false;

	const cleanup = () => {
		if (closed) return;
		closed = true;

		if (heartbeat !== undefined) clearInterval(heartbeat);
		options.signal?.removeEventListener('abort', handleAbort);
		void iterator?.return?.();
	};
	const handleAbort = () => cleanup();

	if (options.signal) {
		if (options.signal.aborted) {
			closed = true;
		} else {
			options.signal.addEventListener('abort', handleAbort, { once: true });
		}
	}

	return new ReadableStream<Uint8Array>({
		async start(controller) {
			const send = (chunk: string): boolean => {
				if (closed) return false;

				try {
					controller.enqueue(encoder.encode(chunk));

					return true;
				} catch {
					cleanup();

					return false;
				}
			};

			send(`retry: ${retryMs}\n\n`);
			send(': connected\n\n');

			if (closed) {
				controller.close();

				return;
			}

			heartbeat = setInterval(() => {
				if (!send(': ping\n\n')) cleanup();
			}, heartbeatMs);

			try {
				iterator = events[Symbol.asyncIterator]();

				while (!closed) {
					const result = await iterator.next();

					if (result.done) break;
					if (!send(formatJobEvent(result.value))) break;
				}
			} catch (cause) {
				cleanup();
				controller.error(cause);

				return;
			}

			cleanup();

			try {
				controller.close();
			} catch {
				// The consumer may have cancelled while the last event was in flight.
			}
		},
		cancel() {
			cleanup();
		}
	});
}

export function formatJobEvent(event: JobEvent): string {
	return `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}

import { isTerminalAiEvent, type AiEvent } from '#lib/ai/types.ts';

export interface AiEventStreamOptions {
	/** Keep-alive comment interval. Defaults to 15s. */
	heartbeatMs?: number;
	/** Reconnection delay advertised to EventSource. Defaults to 3s. */
	retryMs?: number;
	/** Aborts the stream when the HTTP request is cancelled. */
	signal?: AbortSignal;
}

const encoder = new TextEncoder();

/**
 * Turn an AI attempt event stream into a `text/event-stream` body.
 *
 * The stream sends an initial comment, heartbeats while idle, and one named SSE
 * event per AI event. It stops at `success` or `exhausted` so a failed chain is
 * reported once instead of reconnecting forever.
 */
export function createAiEventStream(
	events: AsyncIterable<AiEvent>,
	options: AiEventStreamOptions = {}
): ReadableStream<Uint8Array> {
	const heartbeatMs = Math.max(1, options.heartbeatMs ?? 15_000);
	const retryMs = Math.max(0, options.retryMs ?? 3_000);
	let iterator: AsyncIterator<AiEvent> | undefined;
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

					if (!send(formatAiEvent(result.value))) break;
					if (isTerminalAiEvent(result.value.type)) break;
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

export function formatAiEvent(event: AiEvent): string {
	return `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}

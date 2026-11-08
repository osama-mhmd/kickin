import { JOB_EVENT_TYPES, isTerminalJobEvent, type JobEvent, type QueueName } from './types';

export interface WatchJobEventsOptions {
	/** Called for every event the server sends. */
	onEvent: (event: JobEvent) => void;
	onOpen?: (event: Event) => void;
	/** Transport-level error from EventSource. Reconnection is automatic. */
	onTransportError?: (event: Event) => void;
	onParseError?: (error: unknown) => void;
	withCredentials?: boolean;
}

export interface JobEventSubscription {
	readonly source: EventSource;
	close(): void;
}

export function jobEventsUrl(queue: QueueName, jobId: string): string {
	return `/api/queues/${encodeURIComponent(queue)}/jobs/${encodeURIComponent(jobId)}/events`;
}

/**
 * Subscribe to a job's progress from a Svelte component/page.
 *
 * The server closes the SSE stream after a terminal event, so this helper also
 * closes the EventSource to stop the browser from reconnecting forever. Call
 * `close()` when the component is destroyed.
 */
export function watchJobEvents(
	queue: QueueName,
	jobId: string,
	options: WatchJobEventsOptions
): JobEventSubscription {
	const source = new EventSource(jobEventsUrl(queue, jobId), {
		withCredentials: options.withCredentials
	});
	let closed = false;

	function close(): void {
		if (closed) return;

		closed = true;

		for (const { type, listener } of listeners) {
			source.removeEventListener(type, listener);
		}

		source.close();
	}

	const listeners = JOB_EVENT_TYPES.map((type) => {
		const listener = (event: Event) => {
			if (closed || !(event instanceof MessageEvent)) return;

			let parsed: JobEvent;

			try {
				parsed = JSON.parse(String(event.data)) as JobEvent;
			} catch (error) {
				options.onParseError?.(error);

				return;
			}

			options.onEvent(parsed);

			if (isTerminalJobEvent(parsed.type)) close();
		};

		source.addEventListener(type, listener);

		return { type, listener };
	});

	source.onopen = (event) => {
		if (!closed) options.onOpen?.(event);
	};
	source.onerror = (event) => {
		if (!closed) options.onTransportError?.(event);
	};

	return { source, close };
}

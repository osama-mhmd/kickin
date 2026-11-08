import { AI_EVENT_TYPES, isTerminalAiEvent, type AiEvent } from './types';

export interface WatchAiEventsOptions {
	/** Called for every event the server sends. */
	onEvent: (event: AiEvent) => void;
	onOpen?: (event: Event) => void;
	/** Transport-level error from EventSource. Reconnection is automatic. */
	onTransportError?: (event: Event) => void;
	onParseError?: (error: unknown) => void;
	withCredentials?: boolean;
}

export interface AiEventSubscription {
	readonly source: EventSource;
	close(): void;
}

/**
 * Subscribe to an AI call's attempt/fallback lifecycle from a page or
 * component. The caller supplies the SSE URL because the route is owned by the
 * SvelteKit server layer, not by the AI module.
 *
 * The server closes the stream after `success` or `exhausted`, so this helper
 * also closes the EventSource to stop the browser from reconnecting forever.
 */
export function watchAiEvents(url: string, options: WatchAiEventsOptions): AiEventSubscription {
	const source = new EventSource(url, { withCredentials: options.withCredentials });
	let closed = false;

	function close(): void {
		if (closed) return;

		closed = true;

		for (const { type, listener } of listeners) {
			source.removeEventListener(type, listener);
		}

		source.close();
	}

	const listeners = AI_EVENT_TYPES.map((type) => {
		const listener = (event: Event) => {
			if (closed || !(event instanceof MessageEvent)) return;

			let parsed: AiEvent;

			try {
				parsed = JSON.parse(String(event.data)) as AiEvent;
			} catch (error) {
				options.onParseError?.(error);

				return;
			}

			options.onEvent(parsed);

			if (isTerminalAiEvent(parsed.type)) close();
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

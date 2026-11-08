import { AI_EVENT_TYPES, isTerminalAiEvent, type AiEvent } from './types';

export interface RequestAiEventsOptions {
	/** Called for every event the server sends. */
	onEvent: (event: AiEvent) => void;
	onOpen?: () => void;
	onParseError?: (error: unknown) => void;
	signal?: AbortSignal;
}

/**
 * POST an AI request and consume its SSE response with `fetch`.
 *
 * `EventSource` only supports GET, and AI prompts do not belong in query
 * strings. This helper resolves when the server closes the stream (after
 * `success` or `exhausted`) or the caller aborts.
 */
export async function requestAiEvents(
	url: string,
	body: unknown,
	options: RequestAiEventsOptions
): Promise<void> {
	const response = await fetch(url, {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			accept: 'text/event-stream'
		},
		body: JSON.stringify(body),
		signal: options.signal
	});

	if (!response.ok) {
		throw new Error(await readErrorMessage(response));
	}

	if (!response.body) {
		throw new Error('The AI endpoint returned no event stream.');
	}

	options.onOpen?.();

	const reader = response.body.getReader();
	const decoder = new TextDecoder();
	let buffer = '';

	try {
		while (true) {
			const { done, value } = await reader.read();

			if (done) break;

			buffer += decoder.decode(value, { stream: true }).replaceAll('\r\n', '\n');

			let boundary = buffer.indexOf('\n\n');

			while (boundary !== -1) {
				const chunk = buffer.slice(0, boundary);

				buffer = buffer.slice(boundary + 2);

				let event: AiEvent | null;

				try {
					event = parseAiSseChunk(chunk);
				} catch (error) {
					options.onParseError?.(error);
					boundary = buffer.indexOf('\n\n');

					continue;
				}

				if (event) {
					options.onEvent(event);

					if (isTerminalAiEvent(event.type)) {
						await reader.cancel().catch(() => {});

						return;
					}
				}

				boundary = buffer.indexOf('\n\n');
			}
		}
	} finally {
		reader.releaseLock();
	}
}

function parseAiSseChunk(chunk: string): AiEvent | null {
	const data = chunk
		.split('\n')
		.filter((line) => line.startsWith('data:'))
		.map((line) => line.slice(5).trimStart())
		.join('\n');

	if (data.length === 0) return null;

	return JSON.parse(data) as AiEvent;
}

async function readErrorMessage(response: Response): Promise<string> {
	const fallback = `AI request failed with status ${response.status}.`;

	try {
		const text = await response.text();

		if (text.length === 0) return fallback;

		try {
			const parsed = JSON.parse(text) as { error?: unknown };

			if (typeof parsed.error === 'string') return parsed.error;
		} catch {
			// Fall through to the raw text.
		}

		return text;
	} catch {
		return fallback;
	}
}

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

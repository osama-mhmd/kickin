import { expect, test } from 'vitest';
import type { JobEvent } from '#lib/queues/types.ts';
import { createJobEventStream, formatJobEvent } from './index';

function event(type: JobEvent['type'], id = 'job.1'): JobEvent {
	return {
		id,
		queue: 'ai-analysis',
		name: 'analyze',
		type,
		state: type === 'completed' ? 'completed' : 'active',
		progress: 50,
		attemptsMade: 1,
		data: { issueId: 1 },
		result: null,
		error: null,
		createdAt: 1_000,
		processedAt: 2_000,
		finishedAt: type === 'completed' ? 3_000 : null
	};
}

test('formats named SSE events with a JSON payload', () => {
	const payload = event('progress');

	expect(formatJobEvent(payload)).toBe(`event: progress\ndata: ${JSON.stringify(payload)}\n\n`);
});

test('streams every event and closes when the iterator ends', async () => {
	async function* events(): AsyncGenerator<JobEvent> {
		yield event('snapshot');
		yield event('completed');
	}

	const stream = createJobEventStream(events(), { heartbeatMs: 10_000, retryMs: 0 });
	const reader = stream.getReader();
	const decoder = new TextDecoder();
	let output = '';

	while (true) {
		const { done, value } = await reader.read();

		if (done) break;

		output += decoder.decode(value);
	}

	expect(output).toContain('retry: 0');
	expect(output).toContain('event: snapshot');
	expect(output).toContain('event: completed');
	expect(output).toContain('"id":"job.1"');
});

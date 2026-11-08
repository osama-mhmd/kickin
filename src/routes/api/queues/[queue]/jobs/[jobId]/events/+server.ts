import { json } from '@sveltejs/kit';
import { isQueueName } from '#lib/queues/types.ts';
import { QueueError, createJobEventStream, getQueueModule } from '#lib/server/queues/index.ts';
import type { RequestHandler } from './$types';

/**
 * Server-Sent Events for a single job.
 *
 * The route is deliberately thin: validate params, make sure the queue can be
 * reached, then stream `QueueModule.watchJob`. Business logic stays in the
 * queue module.
 */
export const GET: RequestHandler = async ({ params, request }) => {
	if (!isQueueName(params.queue)) {
		return json({ error: 'Unknown queue.' }, { status: 404 });
	}

	const module = getQueueModule();

	try {
		// Touch the queue before opening the stream so configuration/connection
		// failures become a normal 503 response instead of a reconnect loop.
		await module.getJob(params.queue, params.jobId);
	} catch (cause) {
		if (cause instanceof QueueError) {
			return json(
				{ error: cause.message, code: cause.code },
				{ status: statusForQueueError(cause) }
			);
		}

		return json({ error: 'Queue is unavailable.' }, { status: 503 });
	}

	const events = module.watchJob(params.queue, params.jobId, { signal: request.signal });
	const body = createJobEventStream(events, { signal: request.signal });

	return new Response(body, {
		headers: {
			'content-type': 'text/event-stream; charset=utf-8',
			'cache-control': 'no-cache, no-transform',
			connection: 'keep-alive',
			'x-accel-buffering': 'no'
		}
	});
};

function statusForQueueError(error: QueueError): number {
	if (error.code === 'validation') return 400;
	if (error.code === 'configuration' || error.code === 'connection') return 503;

	return 500;
}

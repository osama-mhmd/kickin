import { json } from '@sveltejs/kit';
import { isQueueName } from '#lib/queues/types.ts';
import { QueueError, getQueueModule } from '#lib/server/queues/index.ts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params }) => {
	if (!isQueueName(params.queue)) {
		return json({ error: 'Unknown queue.' }, { status: 404 });
	}

	try {
		const job = await getQueueModule().getJob(params.queue, params.jobId);

		if (!job) {
			return json({ error: 'Job not found.' }, { status: 404 });
		}

		return json(job);
	} catch (cause) {
		if (cause instanceof QueueError) {
			return json(
				{ error: cause.message, code: cause.code },
				{ status: statusForQueueError(cause) }
			);
		}

		return json({ error: 'Queue is unavailable.' }, { status: 503 });
	}
};

function statusForQueueError(error: QueueError): number {
	if (error.code === 'validation') return 400;
	if (error.code === 'configuration' || error.code === 'connection') return 503;

	return 500;
}

import { describe, expect, test } from 'vitest';
import type { EnqueueOptions, JobEvent, JobProgress, JobState } from '#lib/queues/types.ts';
import { QueueValidationError } from './errors';
import { QueueModule, type QueueClient, type QueueJob } from './queue-manager';

const CONNECTION = { url: 'redis://localhost:6379' };

interface JobOptions {
	id: string;
	name: string;
	data: unknown;
	state?: JobState;
	progress?: JobProgress;
	attemptsMade?: number;
	returnvalue?: unknown;
	error?: string;
}

function fakeJob(options: JobOptions): QueueJob {
	const progress = options.progress ?? null;

	return {
		id: options.id,
		name: options.name,
		data: options.data,
		progress,
		attemptsMade: options.attemptsMade ?? 0,
		returnvalue: options.returnvalue ?? null,
		failedReason: options.error ?? '',
		timestamp: 1_000,
		processedOn: options.state === 'waiting' ? undefined : 2_000,
		finishedOn: options.state === 'completed' ? 3_000 : undefined,
		getState: async () => options.state ?? 'waiting'
	};
}

function recordingQueue(
	jobFactory: (data: unknown, options: EnqueueOptions | undefined) => QueueJob
) {
	const added: { name: string; data: unknown; options: EnqueueOptions | undefined }[] = [];
	let closed = 0;

	const queue: QueueClient = {
		async add(name, data, options) {
			added.push({ name, data, options });

			return jobFactory(data, options);
		},
		async getJob() {
			return undefined;
		},
		async remove() {
			return 1;
		},
		async close() {
			closed += 1;
		}
	};

	return {
		queue,
		added,
		get closeCount() {
			return closed;
		}
	};
}

function scriptedQueue(
	handler: (call: number) => QueueJob | undefined | Promise<QueueJob | undefined>
) {
	let call = 0;

	const queue: QueueClient = {
		async add() {
			throw new Error('add is not expected in this test');
		},
		async getJob() {
			const result = await handler(call);

			call += 1;

			return result;
		},
		async remove() {
			return 1;
		},
		async close() {}
	};

	return {
		queue,
		get calls() {
			return call;
		}
	};
}

function moduleWith(queue: QueueClient): QueueModule {
	return new QueueModule({
		connection: CONNECTION,
		queueFactory: () => queue
	});
}

describe('QueueModule.enqueue', () => {
	test('uses queue defaults, derives an id and returns a snapshot', async () => {
		const recording = recordingQueue((data, options) =>
			fakeJob({
				id: options?.jobId ?? 'missing',
				name: 'analyze',
				data,
				state: 'waiting'
			})
		);
		const module = moduleWith(recording.queue);

		const snapshot = await module.enqueue('ai-analysis', {
			issueId: 1,
			userId: 7,
			mode: 'contributor',
			pass: 1
		});

		expect(recording.added).toHaveLength(1);
		expect(recording.added[0].name).toBe('analyze');
		expect(recording.added[0].options).toMatchObject({
			attempts: 5,
			backoff: { type: 'exponential', delay: 10_000 },
			jobId: 'analysis.1.contributor.user-7.1'
		});
		expect(snapshot).toMatchObject({
			id: 'analysis.1.contributor.user-7.1',
			queue: 'ai-analysis',
			name: 'analyze',
			state: 'waiting',
			data: { issueId: 1, userId: 7, mode: 'contributor', pass: 1 }
		});
	});

	test('accepts an explicit id and per-job overrides', async () => {
		const recording = recordingQueue((data, options) =>
			fakeJob({ id: options?.jobId ?? 'missing', name: 'compute', data })
		);
		const module = moduleWith(recording.queue);

		await module.enqueue(
			'repo-computation',
			{ owner: 'owner', name: 'repo', commitSha: 'sha' },
			{ jobId: 'custom.id', attempts: 1, delay: 500 }
		);

		expect(recording.added[0].options).toMatchObject({
			jobId: 'custom.id',
			attempts: 1,
			delay: 500
		});
	});

	test('validates before touching the queue', async () => {
		const recording = recordingQueue(() => fakeJob({ id: 'x', name: 'compute', data: {} }));
		const module = moduleWith(recording.queue);

		await expect(
			module.enqueue('repo-computation', {
				owner: '',
				name: 'repo',
				commitSha: 'sha'
			})
		).rejects.toBeInstanceOf(QueueValidationError);

		expect(recording.added).toHaveLength(0);
	});
});

describe('QueueModule.getJob', () => {
	test('returns null when the job does not exist', async () => {
		const module = moduleWith(scriptedQueue(() => undefined).queue);

		await expect(
			module.getJob('ai-analysis', 'analysis.1.contributor.user-7.1')
		).resolves.toBeNull();
	});

	test('returns a JSON-safe snapshot', async () => {
		const job = fakeJob({
			id: 'analysis.1.contributor.user-7.1',
			name: 'analyze',
			data: { issueId: 1 },
			state: 'active',
			progress: { percent: 50 },
			attemptsMade: 2
		});
		const module = moduleWith(scriptedQueue(() => job).queue);

		const snapshot = await module.getJob('ai-analysis', 'analysis.1.contributor.user-7.1');

		expect(snapshot).toEqual({
			id: 'analysis.1.contributor.user-7.1',
			queue: 'ai-analysis',
			name: 'analyze',
			state: 'active',
			progress: { percent: 50 },
			attemptsMade: 2,
			data: { issueId: 1 },
			result: null,
			error: null,
			createdAt: 1_000,
			processedAt: 2_000,
			finishedAt: null
		});
	});
});

describe('QueueModule.close', () => {
	test('creates each queue once and closes all of them', async () => {
		let created = 0;
		const closed: string[] = [];

		const module = new QueueModule({
			connection: CONNECTION,
			queueFactory: (name) => {
				created += 1;

				return {
					async add() {
						throw new Error('not used');
					},
					async getJob() {
						return undefined;
					},
					async remove() {
						return 1;
					},
					async close() {
						closed.push(name);
					}
				};
			}
		});

		await module.getJob('repo-computation', 'repo.owner.repo.sha');
		await module.getJob('repo-computation', 'repo.owner.repo.sha');
		await module.getJob('ai-analysis', 'analysis.1.contributor.user-7.1');

		expect(created).toBe(2);

		await module.close();
		await module.close();

		expect(closed.sort()).toEqual(['ai-analysis', 'repo-computation']);
	});
});

describe('QueueModule.watchJob', () => {
	test('emits state and progress changes once, then stops at completion', async () => {
		const waiting = fakeJob({
			id: 'analysis.1.contributor.user-7.1',
			name: 'analyze',
			data: { issueId: 1 },
			state: 'waiting',
			progress: 0
		});
		const active = fakeJob({
			id: 'analysis.1.contributor.user-7.1',
			name: 'analyze',
			data: { issueId: 1 },
			state: 'active',
			progress: 25
		});
		const activeSame = fakeJob({
			id: 'analysis.1.contributor.user-7.1',
			name: 'analyze',
			data: { issueId: 1 },
			state: 'active',
			progress: 25
		});
		const activeMore = fakeJob({
			id: 'analysis.1.contributor.user-7.1',
			name: 'analyze',
			data: { issueId: 1 },
			state: 'active',
			progress: 100
		});
		const completed = fakeJob({
			id: 'analysis.1.contributor.user-7.1',
			name: 'analyze',
			data: { issueId: 1 },
			state: 'completed',
			progress: 100,
			returnvalue: { ok: true }
		});
		const sequence = [waiting, active, activeSame, activeMore, completed];
		const module = moduleWith(scriptedQueue((call) => sequence[call]).queue);

		const events: JobEvent[] = [];

		for await (const event of module.watchJob('ai-analysis', 'analysis.1.contributor.user-7.1', {
			intervalMs: 1
		})) {
			events.push(event);
		}

		expect(events.map((event) => event.type)).toEqual([
			'snapshot',
			'state',
			'progress',
			'completed'
		]);
		expect(events.at(-1)?.result).toEqual({ ok: true });
	});

	test('emits removed when a visible job disappears', async () => {
		const job = fakeJob({
			id: 'repo.owner.repo.sha',
			name: 'compute',
			data: { owner: 'owner', name: 'repo', commitSha: 'sha' },
			state: 'active'
		});
		const module = moduleWith(scriptedQueue((call) => (call === 0 ? job : undefined)).queue);

		const events: JobEvent[] = [];

		for await (const event of module.watchJob('repo-computation', 'repo.owner.repo.sha', {
			intervalMs: 1
		})) {
			events.push(event);
		}

		expect(events.map((event) => event.type)).toEqual(['snapshot', 'removed']);
	});

	test('turns lookup failures into a stream-error event', async () => {
		const module = moduleWith(
			scriptedQueue(() => {
				throw new Error('redis unavailable');
			}).queue
		);

		const events: JobEvent[] = [];

		for await (const event of module.watchJob('repo-computation', 'repo.owner.repo.sha')) {
			events.push(event);
		}

		expect(events).toHaveLength(1);
		expect(events[0]).toMatchObject({
			type: 'stream-error',
			message: 'redis unavailable',
			queue: 'repo-computation'
		});
	});
});

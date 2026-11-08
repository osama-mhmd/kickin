import { Queue, type ConnectionOptions } from 'bullmq';
import type {
	EnqueueOptions,
	JobDataMap,
	JobEvent,
	JobProgress,
	JobSnapshot,
	JobState,
	QueueName
} from '#lib/queues/types.ts';
import { isTerminalJobState } from '#lib/queues/types.ts';
import { createRedisConnectionOptions } from '../connection';
import {
	QUEUE_DEFINITIONS,
	QUEUE_PREFIX,
	assertJobData,
	assertJobId,
	buildJobId
} from '../definitions';

/** The slice of a BullMQ Job this module relies on. Keeps tests driver-free. */
export interface QueueJob<Data = unknown> {
	id?: string;
	name: string;
	data: Data;
	progress: JobProgress;
	attemptsMade: number;
	returnvalue: unknown;
	failedReason: string;
	timestamp: number;
	processedOn?: number;
	finishedOn?: number;
	getState(): Promise<JobState>;
}

/** The slice of a BullMQ Queue this module relies on. */
export interface QueueClient {
	add(name: string, data: unknown, options?: EnqueueOptions): Promise<QueueJob>;
	getJob(jobId: string): Promise<QueueJob | undefined>;
	remove(jobId: string): Promise<unknown>;
	close(): Promise<void>;
}

export interface QueueFactoryOptions {
	connection: ConnectionOptions;
	defaultJobOptions: EnqueueOptions;
	prefix: string;
}

export type QueueFactory = (name: QueueName, options: QueueFactoryOptions) => QueueClient;

export interface QueueModuleOptions {
	/** Override for tests or a non-default Redis instance. */
	connection?: ConnectionOptions;
	/** Override how BullMQ queues are created. Primarily for tests. */
	queueFactory?: QueueFactory;
	/** How often `watchJob` checks state. Defaults to 1.5s. */
	pollIntervalMs?: number;
}

export interface WatchJobOptions {
	intervalMs?: number;
	/** Stop after this long and emit a `timeout` event. No timeout by default. */
	timeoutMs?: number;
	signal?: AbortSignal;
}

const DEFAULT_POLL_INTERVAL_MS = 1_500;

/**
 * The public queue wrapper. Everything that enqueues or inspects a job should
 * go through this class instead of touching BullMQ directly.
 */
export class QueueModule {
	private readonly queues = new Map<QueueName, QueueClient>();
	private readonly connection: ConnectionOptions | undefined;
	private readonly queueFactory: QueueFactory;
	private readonly pollIntervalMs: number;

	constructor(options: QueueModuleOptions = {}) {
		this.connection = options.connection;
		this.queueFactory = options.queueFactory ?? createBullMqQueue;
		this.pollIntervalMs = Math.max(1, options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS);
	}

	/**
	 * Add a job. The job id is derived from the payload by default, so repeating
	 * the same enqueue is safe and returns the existing job.
	 */
	async enqueue<Q extends QueueName>(
		queue: Q,
		data: JobDataMap[Q],
		options: EnqueueOptions = {}
	): Promise<JobSnapshot<JobDataMap[Q]>> {
		assertJobData(queue, data);

		const definition = QUEUE_DEFINITIONS[queue];
		const jobId = options.jobId ?? buildJobId(queue, data);

		assertJobId(jobId);

		const job = await this.getQueue(queue).add(definition.jobName, data, {
			...definition.defaultJobOptions,
			...options,
			jobId
		});

		return this.toSnapshot(queue, job, jobId);
	}

	async getJob<Q extends QueueName>(
		queue: Q,
		jobId: string
	): Promise<JobSnapshot<JobDataMap[Q]> | null> {
		assertJobId(jobId);

		const job = await this.getQueue(queue).getJob(jobId);

		return job ? this.toSnapshot(queue, job, jobId) : null;
	}

	async remove(queue: QueueName, jobId: string): Promise<void> {
		assertJobId(jobId);

		await this.getQueue(queue).remove(jobId);
	}

	/**
	 * Yield job events until the job finishes, disappears, times out, or the
	 * caller aborts. The SSE endpoint is a thin adapter around this generator.
	 */
	async *watchJob<Q extends QueueName>(
		queue: Q,
		jobId: string,
		options: WatchJobOptions = {}
	): AsyncGenerator<JobEvent<JobDataMap[Q]>> {
		assertJobId(jobId);

		const intervalMs = Math.max(1, options.intervalMs ?? this.pollIntervalMs);
		const deadline =
			options.timeoutMs === undefined ? Number.POSITIVE_INFINITY : Date.now() + options.timeoutMs;

		let previous: JobSnapshot<JobDataMap[Q]> | null = null;
		let previousProgressKey = '';

		while (!options.signal?.aborted) {
			let snapshot: JobSnapshot<JobDataMap[Q]> | null;

			try {
				snapshot = await this.getJob(queue, jobId);
			} catch (cause) {
				yield streamErrorEvent(queue, jobId, previous, cause);

				return;
			}

			// A job that was visible before and is now gone was removed. A job that
			// has never been visible may simply be enqueued milliseconds later.
			if (!snapshot) {
				if (previous) {
					yield { ...previous, type: 'removed' };

					return;
				}
			} else {
				const progressKey = progressKeyOf(snapshot.progress);
				const eventType = selectEventType(previous, snapshot, previousProgressKey, progressKey);

				previousProgressKey = progressKey;

				if (eventType) {
					yield { ...snapshot, type: eventType };
				}

				previous = snapshot;

				if (isTerminalJobState(snapshot.state)) return;
			}

			if (Date.now() >= deadline) {
				const snapshotForTimeout = previous ?? emptySnapshot(queue, jobId);

				yield { ...snapshotForTimeout, type: 'timeout' };

				return;
			}

			await delay(Math.min(intervalMs, deadline - Date.now()), options.signal);
		}
	}

	/** Close every queue created by this module. Safe to call more than once. */
	async close(): Promise<void> {
		const queues = [...this.queues.values()];

		this.queues.clear();

		await Promise.allSettled(queues.map((queue) => queue.close()));
	}

	private getQueue<Q extends QueueName>(queue: Q): QueueClient {
		const existing = this.queues.get(queue);

		if (existing) return existing;

		const definition = QUEUE_DEFINITIONS[queue];
		const client = this.queueFactory(queue, {
			connection: this.resolveConnection(),
			defaultJobOptions: definition.defaultJobOptions,
			prefix: QUEUE_PREFIX
		});

		this.queues.set(queue, client);

		return client;
	}

	private resolveConnection(): ConnectionOptions {
		return this.connection ?? createRedisConnectionOptions();
	}

	private async toSnapshot<Q extends QueueName>(
		queue: Q,
		job: QueueJob,
		fallbackId: string
	): Promise<JobSnapshot<JobDataMap[Q]>> {
		return {
			id: job.id ?? fallbackId,
			queue,
			name: job.name,
			state: await job.getState(),
			progress: job.progress ?? null,
			attemptsMade: job.attemptsMade,
			data: (job.data ?? null) as JobDataMap[Q] | null,
			result: job.returnvalue ?? null,
			error: job.failedReason || null,
			createdAt: job.timestamp ?? null,
			processedAt: job.processedOn ?? null,
			finishedAt: job.finishedOn ?? null
		};
	}
}

export function createBullMqQueue(name: QueueName, options: QueueFactoryOptions): QueueClient {
	return new Queue<unknown, unknown, string>(name, {
		connection: options.connection,
		prefix: options.prefix,
		defaultJobOptions: options.defaultJobOptions
	});
}

function selectEventType(
	previous: JobSnapshot | null,
	snapshot: JobSnapshot,
	previousProgressKey: string,
	progressKey: string
): JobEvent['type'] | null {
	if (previous === null) {
		// On a reconnect the job may already be finished; report the terminal
		// event immediately instead of a stale "snapshot".
		return isTerminalJobState(snapshot.state) ? snapshot.state : 'snapshot';
	}

	if (snapshot.state !== previous.state) {
		return isTerminalJobState(snapshot.state) ? snapshot.state : 'state';
	}

	if (progressKey !== previousProgressKey) return 'progress';

	return null;
}

function progressKeyOf(progress: JobProgress): string {
	if (progress === null) return '';
	if (typeof progress === 'string') return progress;

	try {
		return JSON.stringify(progress);
	} catch {
		return String(progress);
	}
}

function emptySnapshot<Q extends QueueName>(queue: Q, jobId: string): JobSnapshot<JobDataMap[Q]> {
	return {
		id: jobId,
		queue,
		name: QUEUE_DEFINITIONS[queue].jobName,
		state: 'unknown',
		progress: null,
		attemptsMade: 0,
		data: null,
		result: null,
		error: null,
		createdAt: null,
		processedAt: null,
		finishedAt: null
	};
}

function streamErrorEvent<Q extends QueueName>(
	queue: Q,
	jobId: string,
	previous: JobSnapshot<JobDataMap[Q]> | null,
	cause: unknown
): JobEvent<JobDataMap[Q]> {
	const message = cause instanceof Error ? cause.message : String(cause);
	const snapshot = previous ?? emptySnapshot(queue, jobId);

	return { ...snapshot, type: 'stream-error', message };
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
	if (ms <= 0 || signal?.aborted) return Promise.resolve();

	return new Promise((resolve) => {
		const finish = () => {
			clearTimeout(timer);
			signal?.removeEventListener('abort', finish);
			resolve();
		};
		const timer = setTimeout(finish, ms);

		signal?.addEventListener('abort', finish, { once: true });
	});
}

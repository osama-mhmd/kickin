import type {
	AiAnalysisJobData,
	EnqueueOptions,
	JobDataMap,
	QueueName,
	RepoComputationJobData
} from '#lib/queues/types.ts';
import { QueueValidationError } from './errors';

/** Namespaces all BullMQ keys so KickIn can share a Redis database. */
export const QUEUE_PREFIX = 'kickin';

export interface QueueDefinition {
	/** One job kind per queue keeps producers honest. */
	jobName: string;
	defaultJobOptions: EnqueueOptions;
}

/**
 * Queue policy lives here, in one place, so producers do not re-invent retry
 * policy and cannot accidentally make a job non-idempotent.
 */
export const QUEUE_DEFINITIONS: { [Q in QueueName]: QueueDefinition } = {
	'repo-computation': {
		jobName: 'compute',
		defaultJobOptions: {
			attempts: 3,
			backoff: { type: 'exponential', delay: 5_000 },
			removeOnComplete: { age: 24 * 60 * 60, count: 1_000 },
			removeOnFail: { age: 7 * 24 * 60 * 60, count: 5_000 }
		}
	},
	'ai-analysis': {
		jobName: 'analyze',
		defaultJobOptions: {
			attempts: 5,
			backoff: { type: 'exponential', delay: 10_000 },
			removeOnComplete: { age: 24 * 60 * 60, count: 2_000 },
			removeOnFail: { age: 7 * 24 * 60 * 60, count: 5_000 }
		}
	}
};

/**
 * Deterministic job IDs make enqueueing idempotent. BullMQ job IDs must not
 * contain `:`, so we use `.` as the separator and percent-encode any dots in
 * the parts themselves.
 */
export function buildJobId<Q extends QueueName>(queue: Q, data: JobDataMap[Q]): string {
	switch (queue) {
		case 'repo-computation': {
			const job = data as RepoComputationJobData;

			return [
				'repo',
				encodeJobIdPart(job.owner),
				encodeJobIdPart(job.name),
				encodeJobIdPart(job.commitSha)
			].join('.');
		}
		case 'ai-analysis': {
			const job = data as AiAnalysisJobData;
			const actor = job.userId === null ? 'maintainer' : `user-${job.userId}`;

			return ['analysis', job.issueId, job.mode, actor, job.pass].join('.');
		}
		default: {
			const unreachable: never = queue;

			throw new QueueValidationError(`Unknown queue "${String(unreachable)}".`);
		}
	}
}

/** Runtime validation for data that crosses the API/worker boundary. */
export function assertJobData(queue: QueueName, data: unknown): void {
	if (!isRecord(data)) {
		throw new QueueValidationError('Job data must be an object.');
	}

	switch (queue) {
		case 'repo-computation': {
			readNonEmptyString(data, 'owner', 'owner');
			readNonEmptyString(data, 'name', 'name');
			readNonEmptyString(data, 'commitSha', 'commitSha');

			break;
		}
		case 'ai-analysis': {
			readPositiveInteger(data, 'issueId', 'issueId');
			readPositiveInteger(data, 'pass', 'pass', { allowed: [1, 2] });
			readMode(data);
			readNullablePositiveInteger(data, 'userId', 'userId');

			break;
		}
		default: {
			const unreachable: never = queue;

			throw new QueueValidationError(`Unknown queue "${String(unreachable)}".`);
		}
	}
}

export function assertJobId(jobId: string): void {
	if (typeof jobId !== 'string' || jobId.trim().length === 0) {
		throw new QueueValidationError('Job id must be a non-empty string.');
	}

	if (jobId.includes(':')) {
		throw new QueueValidationError('Job id must not contain ":". Use "." as a separator.');
	}
}

function encodeJobIdPart(value: string): string {
	return encodeURIComponent(value).replaceAll('.', '%2E');
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readNonEmptyString(record: Record<string, unknown>, key: string, label: string): string {
	const value = record[key];

	if (typeof value !== 'string' || value.trim().length === 0) {
		throw new QueueValidationError(`"${label}" must be a non-empty string.`);
	}

	return value;
}

function readPositiveInteger(
	record: Record<string, unknown>,
	key: string,
	label: string,
	options: { allowed?: number[] } = {}
): number {
	const value = record[key];

	if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
		throw new QueueValidationError(`"${label}" must be a positive integer.`);
	}

	if (options.allowed && !options.allowed.includes(value)) {
		throw new QueueValidationError(`"${label}" must be one of ${options.allowed.join(', ')}.`);
	}

	return value;
}

function readNullablePositiveInteger(
	record: Record<string, unknown>,
	key: string,
	label: string
): number | null {
	if (record[key] === null) return null;

	return readPositiveInteger(record, key, label);
}

function readMode(record: Record<string, unknown>): 'contributor' | 'maintainer' {
	const value = record.mode;

	if (value !== 'contributor' && value !== 'maintainer') {
		throw new QueueValidationError('"mode" must be "contributor" or "maintainer".');
	}

	return value;
}

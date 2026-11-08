/**
 * Shared queue contract.
 *
 * These types are safe to import from the browser. The implementation lives in
 * `src/lib/server/queues` and must never be imported by UI code.
 */

export const QUEUE_NAMES = ['repo-computation', 'ai-analysis'] as const;

export type QueueName = (typeof QUEUE_NAMES)[number];

/** States reported by BullMQ plus our own `unknown` fallback. */
export type JobState =
	| 'waiting'
	| 'active'
	| 'completed'
	| 'failed'
	| 'delayed'
	| 'prioritized'
	| 'waiting-children'
	| 'paused'
	| 'unknown';

export type JobProgress = string | boolean | number | object | null;

export interface RepoComputationJobData {
	owner: string;
	name: string;
	commitSha: string;
}

export type AnalysisMode = 'contributor' | 'maintainer';

export interface AiAnalysisJobData {
	issueId: number;
	userId: number | null;
	mode: AnalysisMode;
	pass: 1 | 2;
}

/** Every queue and the payload its jobs carry. Jobs carry references, not blobs. */
export interface JobDataMap {
	'repo-computation': RepoComputationJobData;
	'ai-analysis': AiAnalysisJobData;
}

/** The subset of BullMQ job options this module exposes. */
export interface EnqueueOptions {
	/** Deterministic IDs are generated automatically when this is omitted. */
	jobId?: string;
	attempts?: number;
	backoff?: { type: 'fixed' | 'exponential'; delay: number };
	delay?: number;
	priority?: number;
	removeOnComplete?: boolean | number | { age: number; count?: number; limit?: number };
	removeOnFail?: boolean | number | { age: number; count?: number; limit?: number };
}

/** A point-in-time view of a job. Safe to serialise to JSON. */
export interface JobSnapshot<Data = unknown> {
	id: string;
	queue: QueueName;
	name: string;
	state: JobState;
	progress: JobProgress;
	attemptsMade: number;
	data: Data | null;
	result: unknown;
	error: string | null;
	createdAt: number | null;
	processedAt: number | null;
	finishedAt: number | null;
}

/**
 * SSE event names. `stream-error` is deliberately not called `error` because
 * native EventSource reserves that name for transport errors.
 */
export type JobEventType =
	| 'snapshot'
	| 'progress'
	| 'state'
	| 'completed'
	| 'failed'
	| 'removed'
	| 'timeout'
	| 'stream-error';

export const JOB_EVENT_TYPES = [
	'snapshot',
	'progress',
	'state',
	'completed',
	'failed',
	'removed',
	'timeout',
	'stream-error'
] as const satisfies readonly JobEventType[];

export interface JobEvent<Data = unknown> extends JobSnapshot<Data> {
	type: JobEventType;
	message?: string;
}

export function isQueueName(value: string): value is QueueName {
	return (QUEUE_NAMES as readonly string[]).includes(value);
}

export function isTerminalJobState(state: JobState): state is 'completed' | 'failed' {
	return state === 'completed' || state === 'failed';
}

/** Event types after which the server closes the stream. */
export function isTerminalJobEvent(type: JobEventType): boolean {
	return (
		type === 'completed' ||
		type === 'failed' ||
		type === 'removed' ||
		type === 'timeout' ||
		type === 'stream-error'
	);
}

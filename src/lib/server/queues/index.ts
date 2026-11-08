import { QueueModule, type QueueModuleOptions } from './queue-manager';

export * from '#lib/queues/types.ts';
export * from './definitions';
export * from './errors';
export {
	QueueModule,
	createBullMqQueue,
	type QueueClient,
	type QueueFactory,
	type QueueFactoryOptions,
	type QueueJob,
	type QueueModuleOptions,
	type WatchJobOptions
} from './queue-manager';
export { createRedisConnectionOptions } from './connection';
export { createJobEventStream, formatJobEvent } from './sse';

export function createQueueModule(options: QueueModuleOptions = {}): QueueModule {
	return new QueueModule(options);
}

let defaultModule: QueueModule | undefined;

/** Shared process-wide module. Lazily connects on first use. */
export function getQueueModule(): QueueModule {
	defaultModule ??= createQueueModule();

	return defaultModule;
}

/** Close and reset the shared module, mainly for tests and graceful shutdown. */
export async function closeQueueModule(): Promise<void> {
	const module = defaultModule;

	defaultModule = undefined;

	await module?.close();
}

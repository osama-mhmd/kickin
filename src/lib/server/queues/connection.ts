import type { ConnectionOptions } from 'bullmq';
import { config } from '#lib/server/config.ts';
import { QueueConfigurationError } from './errors';

const REDIS_PROTOCOLS = new Set(['redis:', 'rediss:']);

/**
 * Build the single Redis connection config shared by queues and workers.
 *
 * BullMQ needs a raw TCP Redis endpoint. Upstash's REST URL/token pair is a
 * different protocol and will not work here. Accept `redis://` (local) and
 * `rediss://` (TLS, used by Upstash).
 */
export function createRedisConnectionOptions(
	redisUrl: string | undefined = config.upstashRedisUrl
): ConnectionOptions {
	if (!redisUrl) {
		throw new QueueConfigurationError(
			'UPSTASH_REDIS_URL is not set. Add a redis:// or rediss:// connection URL before using queues.'
		);
	}

	assertRedisUrl(redisUrl);

	return {
		url: redisUrl,
		// Producers (web requests) should fail fast instead of hanging forever.
		// BullMQ forces `null` on the worker's blocking connection itself, so
		// workers still retry blocking commands indefinitely.
		maxRetriesPerRequest: 3,
		// Upstash can be slow to answer the ready check; disabling it avoids noisy
		// reconnects while BullMQ waits for the socket to be usable.
		enableReadyCheck: false,
		connectionName: 'kickin',
		retryStrategy(times: number): number {
			return Math.min(times * 250, 5_000);
		}
	};
}

function assertRedisUrl(redisUrl: string): void {
	let parsed: URL;

	try {
		parsed = new URL(redisUrl);
	} catch (cause) {
		throw new QueueConfigurationError(
			'UPSTASH_REDIS_URL must be a redis:// or rediss:// connection URL. Upstash REST URLs and tokens do not work with BullMQ.',
			cause
		);
	}

	if (!REDIS_PROTOCOLS.has(parsed.protocol)) {
		throw new QueueConfigurationError(
			`UPSTASH_REDIS_URL uses "${parsed.protocol}". Queues need a redis:// or rediss:// connection URL.`
		);
	}
}

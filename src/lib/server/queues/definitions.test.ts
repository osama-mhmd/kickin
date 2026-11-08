import { describe, expect, test } from 'vitest';
import { isQueueName } from '#lib/queues/types.ts';
import { assertJobData, assertJobId, buildJobId } from './definitions';
import { QueueValidationError } from './errors';

describe('buildJobId', () => {
	test('builds a deterministic repo computation id', () => {
		const id = buildJobId('repo-computation', {
			owner: 'sveltejs',
			name: 'svelte',
			commitSha: 'abc123'
		});

		expect(id).toBe('repo.sveltejs.svelte.abc123');
		expect(
			buildJobId('repo-computation', {
				owner: 'sveltejs',
				name: 'svelte',
				commitSha: 'abc123'
			})
		).toBe(id);
	});

	test('encodes dots so id parts cannot collide', () => {
		expect(
			buildJobId('repo-computation', {
				owner: 'a.b',
				name: 'c',
				commitSha: 'd'
			})
		).toBe('repo.a%2Eb.c.d');
	});

	test('builds contributor and maintainer analysis ids', () => {
		expect(
			buildJobId('ai-analysis', {
				issueId: 42,
				userId: 7,
				mode: 'contributor',
				pass: 1
			})
		).toBe('analysis.42.contributor.user-7.1');

		expect(
			buildJobId('ai-analysis', {
				issueId: 42,
				userId: null,
				mode: 'maintainer',
				pass: 2
			})
		).toBe('analysis.42.maintainer.maintainer.2');
	});
});

describe('assertJobData', () => {
	test('accepts valid payloads', () => {
		expect(() =>
			assertJobData('repo-computation', {
				owner: 'owner',
				name: 'repo',
				commitSha: 'sha'
			})
		).not.toThrow();

		expect(() =>
			assertJobData('ai-analysis', {
				issueId: 1,
				userId: null,
				mode: 'maintainer',
				pass: 1
			})
		).not.toThrow();
	});

	test.each([
		['missing owner', 'repo-computation', { name: 'repo', commitSha: 'sha' }],
		['empty name', 'repo-computation', { owner: 'owner', name: ' ', commitSha: 'sha' }],
		['bad pass', 'ai-analysis', { issueId: 1, userId: 2, mode: 'contributor', pass: 3 }],
		['bad mode', 'ai-analysis', { issueId: 1, userId: 2, mode: 'other', pass: 1 }],
		['bad user', 'ai-analysis', { issueId: 1, userId: 0, mode: 'contributor', pass: 1 }],
		['not an object', 'ai-analysis', 'nope']
	])('rejects %s', (_label, queue, data) => {
		expect(() => assertJobData(queue as 'repo-computation' | 'ai-analysis', data)).toThrow(
			QueueValidationError
		);
	});
});

describe('assertJobId', () => {
	test('rejects empty ids and BullMQ-unsafe colons', () => {
		expect(() => assertJobId('')).toThrow(QueueValidationError);
		expect(() => assertJobId('repo:owner/name')).toThrow(QueueValidationError);
		expect(() => assertJobId('repo.owner.name')).not.toThrow();
	});
});

describe('isQueueName', () => {
	test('recognises only known queues', () => {
		expect(isQueueName('ai-analysis')).toBe(true);
		expect(isQueueName('repo-computation')).toBe(true);
		expect(isQueueName('other')).toBe(false);
	});
});

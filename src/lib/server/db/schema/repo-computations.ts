import {
	index,
	integer,
	jsonb,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	uuid
} from 'drizzle-orm/pg-core';
import { repoComputationStatus } from './enums';
import { timestamps } from './timestamps';
import { repositories } from './repositories';

export const repoComputations = pgTable(
	'repo_computations',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		repositoryId: uuid('repository_id')
			.notNull()
			.references(() => repositories.id, { onDelete: 'cascade' }),
		commitSha: text('commit_sha').notNull(),
		branch: text('branch'),
		status: repoComputationStatus('status').notNull().default('pending'),
		hierarchy: jsonb('hierarchy').$type<Record<string, unknown>>(),
		fileCount: integer('file_count'),
		algorithmVersion: integer('algorithm_version').notNull().default(1),
		error: text('error'),
		computedAt: timestamp('computed_at', { withTimezone: true }),
		...timestamps()
	},
	(t) => [
		uniqueIndex('repo_computations_repository_commit_idx').on(t.repositoryId, t.commitSha),
		index('repo_computations_status_idx').on(t.status)
	]
);

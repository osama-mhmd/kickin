import { sql } from 'drizzle-orm';
import {
	bigint,
	index,
	integer,
	jsonb,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	uuid
} from 'drizzle-orm/pg-core';
import { issueState } from './enums';
import { timestamps } from './timestamps';
import { repositories } from './repositories';

export const issues = pgTable(
	'issues',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		repositoryId: uuid('repository_id')
			.notNull()
			.references(() => repositories.id, { onDelete: 'cascade' }),
		githubId: bigint('github_id', { mode: 'number' }).notNull(),
		number: integer('number').notNull(),
		title: text('title').notNull(),
		body: text('body'),
		state: issueState('state').notNull().default('open'),
		authorLogin: text('author_login'),
		authorGithubId: bigint('author_github_id', { mode: 'number' }),
		labels: jsonb('labels')
			.$type<string[]>()
			.notNull()
			.default(sql`'[]'::jsonb`),
		assignees: jsonb('assignees')
			.$type<string[]>()
			.notNull()
			.default(sql`'[]'::jsonb`),
		commentsCount: integer('comments_count').notNull().default(0),
		htmlUrl: text('html_url').notNull(),
		githubCreatedAt: timestamp('github_created_at', { withTimezone: true }),
		githubUpdatedAt: timestamp('github_updated_at', { withTimezone: true }),
		closedAt: timestamp('closed_at', { withTimezone: true }),
		fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull().defaultNow(),
		...timestamps()
	},
	(t) => [
		uniqueIndex('issues_github_id_idx').on(t.githubId),
		uniqueIndex('issues_repository_number_idx').on(t.repositoryId, t.number),
		index('issues_repository_state_idx').on(t.repositoryId, t.state),
		index('issues_fetched_at_idx').on(t.fetchedAt)
	]
);

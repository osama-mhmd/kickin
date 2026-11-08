import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { reportCategory, reportStatus } from './enums';
import { issueAnalyses } from './issue-analyses';
import { issues } from './issues';
import { repositories } from './repositories';
import { timestamps } from './timestamps';
import { users } from './users';

export const reports = pgTable(
	'reports',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
		category: reportCategory('category').notNull().default('bug'),
		message: text('message').notNull(),
		status: reportStatus('status').notNull().default('open'),
		issueId: uuid('issue_id').references(() => issues.id, { onDelete: 'set null' }),
		repositoryId: uuid('repository_id').references(() => repositories.id, {
			onDelete: 'set null'
		}),
		issueAnalysisId: uuid('issue_analysis_id').references(() => issueAnalyses.id, {
			onDelete: 'set null'
		}),
		resolutionNote: text('resolution_note'),
		resolvedAt: timestamp('resolved_at', { withTimezone: true }),
		...timestamps()
	},
	(t) => [index('reports_status_idx').on(t.status), index('reports_created_at_idx').on(t.createdAt)]
);

import { sql } from 'drizzle-orm';
import {
	check,
	index,
	integer,
	jsonb,
	pgTable,
	real,
	smallint,
	text,
	timestamp,
	uniqueIndex,
	uuid
} from 'drizzle-orm/pg-core';
import { analysisStatus, confidence } from './enums';
import { issueAnalyses } from './issue-analyses';
import { issues } from './issues';
import { timestamps } from './timestamps';
import { users } from './users';

export const issueMatches = pgTable(
	'issue_matches',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		issueId: uuid('issue_id')
			.notNull()
			.references(() => issues.id, { onDelete: 'cascade' }),
		issueAnalysisId: uuid('issue_analysis_id')
			.notNull()
			.references(() => issueAnalyses.id, { onDelete: 'cascade' }),
		fitRating: smallint('fit_rating'),
		confidence: confidence('confidence'),
		evidence: jsonb('evidence')
			.$type<string[]>()
			.notNull()
			.default(sql`'[]'::jsonb`),
		risks: jsonb('risks')
			.$type<string[]>()
			.notNull()
			.default(sql`'[]'::jsonb`),
		estimatedHours: real('estimated_hours'),
		deterministicScore: real('deterministic_score'),
		finalScore: real('final_score'),
		status: analysisStatus('status').notNull().default('pending'),
		provider: text('provider'),
		model: text('model'),
		promptVersion: integer('prompt_version').notNull().default(1),
		inputHash: text('input_hash').notNull(),
		error: text('error'),
		computedAt: timestamp('computed_at', { withTimezone: true }),
		...timestamps()
	},
	(t) => [
		uniqueIndex('issue_matches_user_issue_idx').on(t.userId, t.issueId),
		index('issue_matches_user_id_idx').on(t.userId),
		index('issue_matches_user_score_idx').on(t.userId, t.finalScore),
		check(
			'issue_matches_fit_rating_check',
			sql`${t.fitRating} is null or ${t.fitRating} between 0 and 10`
		),
		check(
			'issue_matches_estimated_hours_check',
			sql`${t.estimatedHours} is null or ${t.estimatedHours} >= 0`
		)
	]
);

import { sql } from 'drizzle-orm';
import {
	check,
	index,
	integer,
	jsonb,
	pgTable,
	smallint,
	text,
	timestamp,
	uniqueIndex,
	uuid
} from 'drizzle-orm/pg-core';
import { analysisStatus } from './enums';
import { issues } from './issues';
import { repoComputations } from './repo-computations';
import { timestamps } from './timestamps';

export const issueAnalyses = pgTable(
	'issue_analyses',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		issueId: uuid('issue_id')
			.notNull()
			.references(() => issues.id, { onDelete: 'cascade' }),
		repoComputationId: uuid('repo_computation_id').references(() => repoComputations.id, {
			onDelete: 'set null'
		}),
		level: smallint('level'),
		summary: text('summary'),
		reasoning: text('reasoning'),
		suggestedLabels: jsonb('suggested_labels')
			.$type<string[]>()
			.notNull()
			.default(sql`'[]'::jsonb`),
		clarifyingQuestions: jsonb('clarifying_questions')
			.$type<string[]>()
			.notNull()
			.default(sql`'[]'::jsonb`),
		requestedFiles: jsonb('requested_files')
			.$type<string[]>()
			.notNull()
			.default(sql`'[]'::jsonb`),
		status: analysisStatus('status').notNull().default('pending'),
		provider: text('provider'),
		model: text('model'),
		promptVersion: integer('prompt_version').notNull().default(1),
		schemaVersion: integer('schema_version').notNull().default(1),
		inputHash: text('input_hash').notNull(),
		tokensIn: integer('tokens_in'),
		tokensOut: integer('tokens_out'),
		latencyMs: integer('latency_ms'),
		error: text('error'),
		computedAt: timestamp('computed_at', { withTimezone: true }),
		...timestamps()
	},
	(t) => [
		uniqueIndex('issue_analyses_issue_id_idx').on(t.issueId),
		index('issue_analyses_status_idx').on(t.status),
		check('issue_analyses_level_check', sql`${t.level} is null or ${t.level} between 0 and 2`)
	]
);

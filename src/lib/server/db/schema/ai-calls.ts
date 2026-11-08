import {
	bigserial,
	boolean,
	index,
	integer,
	pgTable,
	smallint,
	text,
	timestamp,
	uuid
} from 'drizzle-orm/pg-core';
import { aiCallPurpose } from './enums';
import { issueAnalyses } from './issue-analyses';
import { issueMatches } from './issue-matches';

export const aiCalls = pgTable(
	'ai_calls',
	{
		id: bigserial('id', { mode: 'number' }).primaryKey(),
		provider: text('provider').notNull(),
		model: text('model').notNull(),
		purpose: aiCallPurpose('purpose').notNull(),
		success: boolean('success').notNull(),
		jsonValid: boolean('json_valid'),
		latencyMs: integer('latency_ms'),
		tokensIn: integer('tokens_in'),
		tokensOut: integer('tokens_out'),
		rating: smallint('rating'),
		promptVersion: integer('prompt_version'),
		issueAnalysisId: uuid('issue_analysis_id').references(() => issueAnalyses.id, {
			onDelete: 'set null'
		}),
		issueMatchId: uuid('issue_match_id').references(() => issueMatches.id, {
			onDelete: 'set null'
		}),
		errorCode: text('error_code'),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [
		index('ai_calls_provider_model_created_at_idx').on(t.provider, t.model, t.createdAt),
		index('ai_calls_purpose_created_at_idx').on(t.purpose, t.createdAt)
	]
);

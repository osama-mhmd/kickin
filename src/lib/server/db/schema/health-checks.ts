import { bigserial, boolean, index, integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

export const healthChecks = pgTable(
	'health_checks',
	{
		id: bigserial('id', { mode: 'number' }).primaryKey(),
		target: text('target').notNull(),
		ok: boolean('ok').notNull(),
		statusCode: integer('status_code'),
		latencyMs: integer('latency_ms'),
		error: text('error'),
		checkedAt: timestamp('checked_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [index('health_checks_target_checked_at_idx').on(t.target, t.checkedAt)]
);

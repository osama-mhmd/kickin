import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { incidentSeverity, incidentStatus } from './enums';
import { timestamps } from './timestamps';

export const incidents = pgTable(
	'incidents',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		title: text('title').notNull(),
		description: text('description'),
		severity: incidentSeverity('severity').notNull().default('minor'),
		status: incidentStatus('status').notNull().default('investigating'),
		startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
		resolvedAt: timestamp('resolved_at', { withTimezone: true }),
		...timestamps()
	},
	(t) => [
		index('incidents_status_idx').on(t.status),
		index('incidents_started_at_idx').on(t.startedAt)
	]
);
